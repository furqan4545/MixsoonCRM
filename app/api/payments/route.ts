import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { decrypt } from "@/app/lib/crypto";

export const dynamic = "force-dynamic";

function maskAccount(encrypted: string | null): string {
  if (!encrypted) return "—";
  try {
    const plain = decrypt(encrypted);
    return `****${plain.slice(-4)}`;
  } catch {
    return "****";
  }
}

// GET /api/payments — list with filters
export async function GET(request: NextRequest) {
  await requirePermission("payments", "read");

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "";
  const influencerId = searchParams.get("influencerId") || "";
  const campaignId = searchParams.get("campaignId") || "";
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (influencerId) where.influencerId = influencerId;
  if (campaignId) where.campaignId = campaignId;
  if (search) {
    where.OR = [
      { influencer: { username: { contains: search, mode: "insensitive" } } },
      { influencer: { displayName: { contains: search, mode: "insensitive" } } },
      { bankName: { contains: search, mode: "insensitive" } },
      { invoiceNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
        campaign: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.payment.count({ where }),
  ]);

  // Mask account numbers in response
  const masked = payments.map((p) => ({
    ...p,
    accountNumberMasked: maskAccount(p.accountNumber),
    accountNumber: undefined, // never send encrypted value to client
  }));

  return NextResponse.json({ payments: masked, total, page, pageSize });
}

// POST /api/payments — create payment
export async function POST(request: NextRequest) {
  const user = await requirePermission("payments", "write");

  const body = await request.json();
  const { influencerId, campaignId, amount, currency, invoiceNumber, notes } = body;

  if (!influencerId || !amount) {
    return NextResponse.json({ error: "influencerId and amount are required" }, { status: 400 });
  }

  // Get bank details from onboarding
  const onboarding = await prisma.influencerOnboarding.findUnique({
    where: { influencerId },
  });

  if (!onboarding) {
    return NextResponse.json(
      { error: "No payment details on file. Request payment details from the influencer first." },
      { status: 400 },
    );
  }

  const payment = await prisma.payment.create({
    data: {
      influencerId,
      campaignId: campaignId || null,
      amount: parseFloat(amount),
      currency: currency || "KRW",
      bankName: onboarding.bankName,
      accountNumber: onboarding.accountNumber, // already encrypted
      accountHolder: onboarding.accountHolder,
      bankCode: onboarding.bankCode,
      invoiceNumber: invoiceNumber || null,
      notes: notes || null,
      createdById: user.id,
    },
    include: {
      influencer: { select: { id: true, username: true, displayName: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      influencerId,
      type: "payment_created",
      title: "Payment record created",
      detail: `${parseFloat(amount).toLocaleString()} ${currency || "KRW"} — ${onboarding.bankName} (${onboarding.accountHolder})`,
    },
  });

  return NextResponse.json(payment, { status: 201 });
}
