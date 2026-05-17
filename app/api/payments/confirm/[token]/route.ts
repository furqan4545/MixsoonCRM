import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// PUBLIC — no auth. The token IS the auth. Influencer clicked a link from
// their "Sent" notification email.

type Params = { params: Promise<{ token: string }> };

// GET /api/payments/confirm/[token] — fetch payment summary for the confirm page.
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
      confirmedAt: true,
      confirmTokenExpiresAt: true,
      confirmedByEmail: true,
      confirmedByUserId: true,
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
    confirmedAt: payment.confirmedAt,
    // Distinguish self-confirmed vs force-marked when the influencer revisits
    // a stale link — UI shows "Already confirmed by …".
    alreadyConfirmedByTeam: !!payment.confirmedByUserId,
    confirmedByEmail: payment.confirmedByEmail,
    influencer: payment.influencer,
    campaign: payment.campaign,
  });
}

// POST /api/payments/confirm/[token] — mark the payment as RECEIVED via the
// influencer's email link. confirmedByUserId stays NULL on this path; the
// dashboard reads (confirmedAt && !confirmedByUserId) as "self-confirmed".
export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const payment = await prisma.payment.findUnique({
    where: { confirmToken: token },
    include: { influencer: { select: { email: true, username: true } } },
  });

  if (!payment) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }
  if (payment.confirmTokenExpiresAt && payment.confirmTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (payment.status === "RECEIVED") {
    return NextResponse.json({
      success: true,
      alreadyConfirmed: true,
      confirmedAt: payment.confirmedAt,
    });
  }

  const now = new Date();
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "RECEIVED",
      confirmedAt: now,
      // confirmedByUserId stays null — that's the signal for "influencer self-confirmed".
      confirmedByEmail: payment.influencer.email ?? null,
      // Token stays alive so the influencer can still hit /payments/proof-request/{token}
      // after self-confirming. Re-clicking /confirm/{token} short-circuits on
      // status === RECEIVED above.
    },
  });

  await prisma.activityLog.create({
    data: {
      influencerId: payment.influencerId,
      type: "payment_status_changed",
      title: "Payment status: RECEIVED",
      detail: `${payment.amount.toLocaleString()} ${payment.currency} — confirmed by influencer @${payment.influencer.username}`,
    },
  });

  return NextResponse.json({ success: true, alreadyConfirmed: false, confirmedAt: now });
}
