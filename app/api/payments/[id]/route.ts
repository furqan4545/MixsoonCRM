import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { decrypt } from "@/app/lib/crypto";
import { getSmtpTransport } from "@/app/lib/email";
import { PaymentStatus } from "@prisma/client";

const CONFIRM_TOKEN_TTL_DAYS = 30;
const PUBLIC_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

function maskAccount(encrypted: string | null): string {
  if (!encrypted) return "—";
  try {
    const plain = decrypt(encrypted);
    return `****${plain.slice(-4)}`;
  } catch {
    return "****";
  }
}

// GET /api/payments/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("payments", "read");
  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
      campaign: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      confirmedByUser: { select: { id: true, name: true, email: true } },
      proofSentByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...payment,
    accountNumberMasked: maskAccount(payment.accountNumber),
    accountNumber: undefined,
    // Don't leak the raw token over the authenticated GET.
    confirmToken: undefined,
  });
}

// PATCH /api/payments/[id] — update status, notes, amount
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requirePermission("payments", "write");
  const { id } = await params;
  const body = await request.json();

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.invoiceNumber !== undefined) data.invoiceNumber = body.invoiceNumber;
  if (body.amount !== undefined) data.amount = parseFloat(body.amount);
  if (body.currency !== undefined) data.currency = body.currency;

  // confirmToken doubles as the auth for both the "confirm receipt" and
  // "request proof of payment" public pages — one signed link, two flows.
  // We mint it on SENT or PROCESSING so the influencer can request proof
  // even before the funds are sent.
  let issuedConfirmToken: string | null = null;

  if (body.status && body.status !== payment.status) {
    const newStatus = body.status as PaymentStatus;
    data.status = newStatus;
    const needsToken = newStatus === "SENT" || newStatus === "PROCESSING";
    if (needsToken) {
      const stillValid =
        payment.confirmToken &&
        payment.confirmTokenExpiresAt &&
        payment.confirmTokenExpiresAt > new Date();
      if (stillValid) {
        issuedConfirmToken = payment.confirmToken;
      } else {
        issuedConfirmToken = randomBytes(32).toString("hex");
        data.confirmToken = issuedConfirmToken;
        data.confirmTokenExpiresAt = new Date(
          Date.now() + CONFIRM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
        );
      }
    }
    if (newStatus === "SENT") {
      data.paidAt = new Date();
    }
    if (newStatus === "RECEIVED") {
      data.confirmedAt = new Date();
      // Force-mark path: internal user override. Record who did it so the UI
      // can show "Marked received by {email}" vs influencer self-confirm.
      data.confirmedByUserId = user.id;
      data.confirmedByEmail = user.email;
      // We keep the token alive so the influencer can still revisit the link
      // (e.g. download proof or see "Already confirmed" message).
    }
    if (newStatus !== "RECEIVED" && payment.status === "RECEIVED") {
      // Status moved away from RECEIVED — clear confirmation snapshot.
      data.confirmedAt = null;
      data.confirmedByUserId = null;
      data.confirmedByEmail = null;
    }

    await prisma.activityLog.create({
      data: {
        influencerId: payment.influencerId,
        type: "payment_status_changed",
        title: `Payment status: ${newStatus}`,
        detail:
          newStatus === "RECEIVED"
            ? `${payment.amount.toLocaleString()} ${payment.currency} — marked RECEIVED by ${user.email}`
            : `${payment.amount.toLocaleString()} ${payment.currency} — ${payment.status} → ${newStatus}`,
      },
    });
  }

  const updated = await prisma.payment.update({
    where: { id },
    data,
    include: {
      influencer: { select: { id: true, username: true, displayName: true, email: true } },
      confirmedByUser: { select: { id: true, name: true, email: true } },
      proofSentByUser: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify influencer about status change via email
  if (body.notifyInfluencer && body.status && updated.influencer.email) {
    try {
      const senderAccount = await prisma.emailAccount.findUnique({ where: { userId: user.id } });
      if (senderAccount) {
        const statusMessages: Record<string, string> = {
          PROCESSING: "Your payment is now being processed. We will notify you once it has been sent.",
          SENT: `Your payment of ${updated.amount.toLocaleString()} ${updated.currency} has been sent to your account. Please allow a few business days for it to arrive.`,
          RECEIVED: "We have confirmed that your payment has been received. Thank you!",
          FAILED: "Unfortunately, there was an issue with your payment. Our team will reach out to resolve this.",
        };
        const statusMsg = statusMessages[body.status] || `Your payment status has been updated to: ${body.status}`;
        // Confirm Receipt only shows on SENT — there's nothing to confirm yet on PROCESSING.
        const confirmUrl =
          body.status === "SENT" && issuedConfirmToken
            ? `${PUBLIC_APP_URL}/payments/confirm/${issuedConfirmToken}`
            : null;
        // Request Proof shows on both PROCESSING and SENT so the influencer can
        // ask for proof at any point during the payment lifecycle.
        const proofRequestUrl =
          (body.status === "SENT" || body.status === "PROCESSING") && issuedConfirmToken
            ? `${PUBLIC_APP_URL}/payments/proof-request/${issuedConfirmToken}`
            : null;
        const confirmButtonHtml = confirmUrl
          ? `
              <div style="text-align: center; margin: 16px 0 8px 0;">
                <a href="${confirmUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Confirm Payment Received
                </a>
              </div>
            `
          : "";
        const proofButtonHtml = proofRequestUrl
          ? `
              <div style="text-align: center; margin: 8px 0 16px 0;">
                <a href="${proofRequestUrl}" style="display: inline-block; background: white; color: #0f172a; text-decoration: none; padding: 11px 23px; border-radius: 8px; font-weight: 600; font-size: 14px; border: 1px solid #cbd5e1;">
                  Request Proof of Payment
                </a>
                <p style="margin: 12px 0 0 0; font-size: 12px; color: #999;">
                  Links expire in ${CONFIRM_TOKEN_TTL_DAYS} days.
                </p>
              </div>
            `
          : "";
        const transport = getSmtpTransport(senderAccount);
        await transport.sendMail({
          from: `"MIXSOON" <${senderAccount.emailAddress}>`,
          to: updated.influencer.email,
          subject: `Payment Update: ${body.status} — ${updated.amount.toLocaleString()} ${updated.currency}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="margin: 0 0 16px 0;">Payment Status Update</h2>
              <p>Hi ${updated.influencer.displayName || updated.influencer.username},</p>
              <p>${statusMsg}</p>
              <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 6px 0; color: #666;">Amount</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${updated.amount.toLocaleString()} ${updated.currency}</td></tr>
                  <tr><td style="padding: 6px 0; color: #666;">Status</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${body.status}</td></tr>
                </table>
              </div>
              ${confirmButtonHtml}
              ${proofButtonHtml}
              <p style="color: #999; font-size: 12px; margin-top: 24px;">— MIXSOON Team</p>
            </div>
          `,
        });
        transport.close();
      }
    } catch (emailErr) {
      console.error("[payment-notify] Failed to email influencer:", emailErr instanceof Error ? emailErr.message : emailErr);
    }
  }

  return NextResponse.json({
    ...updated,
    accountNumberMasked: maskAccount(updated.accountNumber),
    accountNumber: undefined,
    confirmToken: undefined, // never leak token over authenticated GET/PATCH
  });
}

// DELETE /api/payments/[id] — only PENDING
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("payments", "delete");
  const { id } = await params;

  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json(
      { error: "Can only delete payments in PENDING status" },
      { status: 400 },
    );
  }

  await prisma.payment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
