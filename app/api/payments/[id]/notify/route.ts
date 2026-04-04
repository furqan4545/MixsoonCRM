import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSmtpTransport } from "@/app/lib/email";
import { decrypt } from "@/app/lib/crypto";

// POST /api/payments/[id]/notify — email other users about this payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requirePermission("payments", "write");
  const { id } = await params;
  const body = await request.json();
  const { userIds, message } = body as { userIds: string[]; message?: string };

  if (!userIds?.length) {
    return NextResponse.json({ error: "Select at least one user to notify" }, { status: 400 });
  }

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      influencer: { select: { username: true, displayName: true } },
      campaign: { select: { name: true } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  // Get current user's email account for sending
  const senderAccount = await prisma.emailAccount.findUnique({
    where: { userId: currentUser.id },
  });

  if (!senderAccount) {
    return NextResponse.json(
      { error: "Connect your email account in Settings first" },
      { status: 400 },
    );
  }

  // Get target users' emails
  const targetUsers = await prisma.user.findMany({
    where: { id: { in: userIds }, status: "ACTIVE" },
    select: { id: true, name: true, email: true },
  });

  if (targetUsers.length === 0) {
    return NextResponse.json({ error: "No valid users found" }, { status: 400 });
  }

  const influencerName = payment.influencer.displayName || payment.influencer.username;
  const maskedAccount = payment.accountNumber
    ? `****${(() => { try { return decrypt(payment.accountNumber).slice(-4); } catch { return ""; } })()}`
    : "N/A";

  const transport = getSmtpTransport(senderAccount);
  let sentCount = 0;

  for (const targetUser of targetUsers) {
    try {
      await transport.sendMail({
        from: `"MIXSOON Payments" <${senderAccount.emailAddress}>`,
        to: targetUser.email,
        subject: `Payment Alert: ${payment.amount.toLocaleString()} ${payment.currency} for @${payment.influencer.username} — ${payment.status}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1a1a2e; padding: 24px; border-radius: 12px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px;">Payment Notification</h1>
              <p style="margin: 0; font-size: 14px; opacity: 0.8;">From ${currentUser.name || currentUser.email}</p>
            </div>

            ${message ? `<div style="background: #f0f4ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px;"><p style="margin: 0; font-size: 14px;">${message}</p></div>` : ""}

            <div style="background: #f9f9f9; border-radius: 8px; padding: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Influencer</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; text-align: right;">@${payment.influencer.username} (${influencerName})</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Amount</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; text-align: right; color: #16a34a;">${payment.amount.toLocaleString()} ${payment.currency}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Status</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; text-align: right;">${payment.status}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Bank</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${payment.bankName || "N/A"} — ${maskedAccount}</td></tr>
                ${payment.campaign ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Campaign</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${payment.campaign.name}</td></tr>` : ""}
                ${payment.invoiceNumber ? `<tr><td style="padding: 8px 0; border-bottom: 1px solid #eee; color: #666;">Invoice</td><td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${payment.invoiceNumber}</td></tr>` : ""}
              </table>
            </div>

            <p style="text-align: center; color: #999; font-size: 12px; margin-top: 24px;">MIXSOON Influencer OS — Payment Management</p>
          </div>
        `,
      });
      sentCount++;
    } catch (err) {
      console.error(`[payment-notify] Failed to send to ${targetUser.email}:`, err instanceof Error ? err.message : err);
    }
  }

  transport.close();

  return NextResponse.json({ success: true, notifiedCount: sentCount });
}
