import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { decrypt } from "@/app/lib/crypto";
import { PaymentStatus } from "@prisma/client";

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
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...payment,
    accountNumberMasked: maskAccount(payment.accountNumber),
    accountNumber: undefined,
  });
}

// PATCH /api/payments/[id] — update status, notes, amount
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("payments", "write");
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

  if (body.status && body.status !== payment.status) {
    const newStatus = body.status as PaymentStatus;
    data.status = newStatus;
    if (newStatus === "SENT") data.paidAt = new Date();
    if (newStatus === "RECEIVED") data.confirmedAt = new Date();

    await prisma.activityLog.create({
      data: {
        influencerId: payment.influencerId,
        type: "payment_status_changed",
        title: `Payment status: ${newStatus}`,
        detail: `${payment.amount.toLocaleString()} ${payment.currency} — ${payment.status} → ${newStatus}`,
      },
    });
  }

  const updated = await prisma.payment.update({
    where: { id },
    data,
    include: {
      influencer: { select: { id: true, username: true, displayName: true } },
    },
  });

  return NextResponse.json({
    ...updated,
    accountNumberMasked: maskAccount(updated.accountNumber),
    accountNumber: undefined,
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
