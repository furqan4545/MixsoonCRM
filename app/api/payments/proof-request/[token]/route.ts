import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSmtpTransport } from "@/app/lib/email";

// PUBLIC — no auth. Token IS the auth.
// Reuses Payment.confirmToken (one signed link covers Confirm + Proof flows).

type Params = { params: Promise<{ token: string }> };

// GET — public summary of the payment for the request page.
export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const payment = await prisma.payment.findUnique({
    where: { confirmToken: token },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      bankName: true,
      paidAt: true,
      confirmTokenExpiresAt: true,
      proofRequestedAt: true,
      proofSentAt: true,
      proofSentMessage: true,
      proofFiles: true,
      influencer: { select: { username: true, displayName: true, email: true } },
      campaign: { select: { name: true } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }
  if (payment.confirmTokenExpiresAt && payment.confirmTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  return NextResponse.json({
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    bankName: payment.bankName,
    paidAt: payment.paidAt,
    proofRequestedAt: payment.proofRequestedAt,
    proofSentAt: payment.proofSentAt,
    proofSentMessage: payment.proofSentMessage,
    // The influencer-facing page doesn't need GCS paths — proof is delivered
    // by email. Just surface whether it was sent.
    proofFilesCount: Array.isArray(payment.proofFiles) ? payment.proofFiles.length : 0,
    influencer: payment.influencer,
    campaign: payment.campaign,
  });
}

// POST — influencer asks for proof of payment.
export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const payment = await prisma.payment.findUnique({
    where: { confirmToken: token },
    include: {
      influencer: { select: { username: true, email: true } },
      campaign: { select: { name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }
  if (payment.confirmTokenExpiresAt && payment.confirmTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (payment.proofRequestedAt) {
    return NextResponse.json({
      success: true,
      alreadyRequested: true,
      requestedAt: payment.proofRequestedAt,
    });
  }

  const now = new Date();
  await prisma.payment.update({
    where: { id: payment.id },
    data: { proofRequestedAt: now },
  });

  await prisma.activityLog.create({
    data: {
      influencerId: payment.influencerId,
      type: "payment_proof_requested",
      title: "Proof of payment requested",
      detail: `@${payment.influencer.username} requested proof of payment for ${payment.amount.toLocaleString()} ${payment.currency}`,
    },
  });

  // Best-effort: notify the payment creator via their connected email. If they
  // have no EmailAccount, we silently skip — the in-app banner will still show.
  if (payment.createdBy?.email && payment.createdBy.id) {
    try {
      const senderAccount = await prisma.emailAccount.findUnique({
        where: { userId: payment.createdBy.id },
      });
      if (senderAccount) {
        const transport = getSmtpTransport(senderAccount);
        await transport.sendMail({
          from: `"MIXSOON Payments" <${senderAccount.emailAddress}>`,
          to: payment.createdBy.email,
          subject: `Proof of payment requested — @${payment.influencer.username}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="margin: 0 0 12px 0;">Proof of payment requested</h2>
              <p>@${payment.influencer.username} has requested proof of payment.</p>
              <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 6px 0; color: #666;">Amount</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${payment.amount.toLocaleString()} ${payment.currency}</td></tr>
                  <tr><td style="padding: 6px 0; color: #666;">Status</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${payment.status}</td></tr>
                  ${payment.campaign ? `<tr><td style="padding: 6px 0; color: #666;">Campaign</td><td style="padding: 6px 0; text-align: right;">${payment.campaign.name}</td></tr>` : ""}
                </table>
              </div>
              <p style="font-size: 13px; color: #444;">Open the payment in MIXSOON to attach and send proof.</p>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">— MIXSOON</p>
            </div>
          `,
        });
        transport.close();
      }
    } catch (err) {
      console.error(
        "[payment-proof-request] notify creator failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ success: true, alreadyRequested: false, requestedAt: now });
}
