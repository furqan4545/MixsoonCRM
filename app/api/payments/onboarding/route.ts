import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { decrypt } from "@/app/lib/crypto";

export const dynamic = "force-dynamic";

// GET /api/payments/onboarding?influencerId=xxx — get full decrypted payment details
export async function GET(request: NextRequest) {
  await requirePermission("payments", "read");

  const influencerId = request.nextUrl.searchParams.get("influencerId");
  if (!influencerId) {
    return NextResponse.json({ error: "influencerId required" }, { status: 400 });
  }

  const onboarding = await prisma.influencerOnboarding.findUnique({
    where: { influencerId },
  });

  if (!onboarding) {
    return NextResponse.json({ exists: false });
  }

  // Decrypt account number
  let accountNumberDecrypted: string | null = null;
  try {
    accountNumberDecrypted = decrypt(onboarding.accountNumber);
  } catch {
    accountNumberDecrypted = "(decryption failed)";
  }

  return NextResponse.json({
    exists: true,
    bankName: onboarding.bankName,
    accountNumber: accountNumberDecrypted,
    accountHolder: onboarding.accountHolder,
    bankCode: onboarding.bankCode,
    fullName: onboarding.fullName,
    addressLine1: onboarding.addressLine1,
    addressLine2: onboarding.addressLine2,
    city: onboarding.city,
    postalCode: onboarding.postalCode,
    country: onboarding.country,
    submittedAt: onboarding.submittedAt?.toISOString() ?? null,
  });
}
