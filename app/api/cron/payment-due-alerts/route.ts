import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { notifyPaymentsTeam } from "@/app/lib/notifications";
import { getSmtpTransport } from "@/app/lib/email";

export const dynamic = "force-dynamic";

// Default thresholds in days. PROCESSING is more urgent than PENDING.
const DEFAULT_PENDING_DAYS = 7;
const DEFAULT_PROCESSING_DAYS = 3;

// Dedupe: don't fire more than one payment_due alert per Payment per N hours.
const DEDUPE_HOURS = 20;

function fmtAmount(n: number, currency: string): string {
  if (currency === "KRW") return `₩${n.toLocaleString()}`;
  if (currency === "USD") return `$${n.toLocaleString()}`;
  return `${n.toLocaleString()} ${currency}`;
}

// GET /api/cron/payment-due-alerts?pendingDays=7&processingDays=3
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const pendingDays = Math.max(
    1,
    parseInt(url.searchParams.get("pendingDays") ?? "", 10) ||
      DEFAULT_PENDING_DAYS,
  );
  const processingDays = Math.max(
    1,
    parseInt(url.searchParams.get("processingDays") ?? "", 10) ||
      DEFAULT_PROCESSING_DAYS,
  );

  const now = Date.now();
  const pendingCutoff = new Date(now - pendingDays * 24 * 60 * 60 * 1000);
  const processingCutoff = new Date(now - processingDays * 24 * 60 * 60 * 1000);
  const dedupeCutoff = new Date(now - DEDUPE_HOURS * 60 * 60 * 1000);

  const overdue = await prisma.payment.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: pendingCutoff } },
        { status: "PROCESSING", createdAt: { lt: processingCutoff } },
      ],
    },
    include: {
      influencer: { select: { username: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    paymentId: string;
    influencer: string;
    status: string;
    daysOverdue: number;
    notified: number;
    skipped?: string;
  }> = [];

  for (const p of overdue) {
    // Dedupe: skip if we already fired a payment_due notification for this payment recently.
    const recent = await prisma.notification.findFirst({
      where: {
        type: "payment_due",
        paymentId: p.id,
        createdAt: { gt: dedupeCutoff },
      },
      select: { id: true },
    });

    const daysOverdue = Math.floor(
      (now - p.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const label = p.influencer.displayName || p.influencer.username;

    if (recent) {
      results.push({
        paymentId: p.id,
        influencer: `@${p.influencer.username}`,
        status: p.status,
        daysOverdue,
        notified: 0,
        skipped: "already_alerted_within_dedupe_window",
      });
      continue;
    }

    const notified = await notifyPaymentsTeam({
      type: "payment_due",
      status: p.status === "PROCESSING" ? "error" : "info",
      title: `Payment overdue — ${label}`,
      message: `${fmtAmount(p.amount, p.currency)} has been ${p.status} for ${daysOverdue} days. Invoice: ${p.invoiceNumber ?? "—"}`,
      paymentId: p.id,
    });

    results.push({
      paymentId: p.id,
      influencer: `@${p.influencer.username}`,
      status: p.status,
      daysOverdue,
      notified,
    });
  }

  // Single digest email to the first available EmailAccount (ops inbox) when anything fired.
  const firedCount = results.filter((r) => r.notified > 0).length;
  if (firedCount > 0) {
    try {
      const emailAccount = await prisma.emailAccount.findFirst();
      if (emailAccount) {
        const lines = results
          .filter((r) => r.notified > 0)
          .map(
            (r) =>
              `<tr><td style="padding:6px 12px">${r.influencer}</td><td style="padding:6px 12px">${r.status}</td><td style="padding:6px 12px">${r.daysOverdue}d</td></tr>`,
          )
          .join("");
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:20px;">
            <h2 style="margin:0 0 8px">Payments overdue — ${firedCount}</h2>
            <p style="color:#666;font-size:13px;margin:0 0 16px">Thresholds: PENDING &gt; ${pendingDays}d, PROCESSING &gt; ${processingDays}d.</p>
            <table style="width:100%;border-collapse:collapse;border:1px solid #eee;font-size:13px">
              <thead><tr style="background:#fafafa"><th style="text-align:left;padding:6px 12px">Influencer</th><th style="text-align:left;padding:6px 12px">Status</th><th style="text-align:left;padding:6px 12px">Overdue</th></tr></thead>
              <tbody>${lines}</tbody>
            </table>
          </div>
        `;
        const transport = getSmtpTransport(emailAccount);
        await transport.sendMail({
          from: `"MIXSOON Payments" <${emailAccount.emailAddress}>`,
          to: emailAccount.emailAddress,
          subject: `[MIXSOON] ${firedCount} payment${firedCount === 1 ? "" : "s"} overdue`,
          html,
        });
        transport.close();
      }
    } catch (err) {
      console.error("[cron/payment-due-alerts] digest email failed:", err);
    }
  }

  return NextResponse.json({
    checked: overdue.length,
    firedCount,
    pendingDays,
    processingDays,
    results,
  });
}
