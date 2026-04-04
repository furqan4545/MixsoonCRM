import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { decrypt } from "@/app/lib/crypto";

export const dynamic = "force-dynamic";

// GET /api/payments/check-bank?influencerId=xxx — check if influencer has bank details
export async function GET(request: NextRequest) {
  await requirePermission("payments", "read");

  const influencerId = request.nextUrl.searchParams.get("influencerId");
  if (!influencerId) {
    return NextResponse.json({ has: false });
  }

  const onboarding = await prisma.influencerOnboarding.findUnique({
    where: { influencerId },
    select: { bankName: true, accountNumber: true, accountHolder: true },
  });

  if (!onboarding || !onboarding.bankName) {
    return NextResponse.json({ has: false });
  }

  let masked = "****";
  try {
    const plain = decrypt(onboarding.accountNumber);
    masked = `****${plain.slice(-4)}`;
  } catch { /* */ }

  return NextResponse.json({
    has: true,
    bankName: onboarding.bankName,
    accountHolder: onboarding.accountHolder,
    masked,
  });
}
