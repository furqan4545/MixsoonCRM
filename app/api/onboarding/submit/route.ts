import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";

// POST /api/onboarding/submit — Public: submit onboarding form (token-based auth)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      token,
      bankName,
      accountNumber,
      accountHolder,
      bankCode,
      fullName,
      addressLine1,
      addressLine2,
      city,
      postalCode,
      country = "South Korea",
    } = body;

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Validate token
    const record = await prisma.onboardingToken.findUnique({
      where: { token },
      include: { influencer: { select: { id: true, username: true } } },
    });

    if (!record) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    if (record.usedAt) {
      return NextResponse.json(
        { error: "This link has already been used" },
        { status: 410 },
      );
    }
    if (record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This link has expired" },
        { status: 410 },
      );
    }

    // Validate required fields
    if (!bankName || !accountNumber || !accountHolder || !fullName || !addressLine1 || !city || !postalCode) {
      return NextResponse.json(
        { error: "All required fields must be filled" },
        { status: 400 },
      );
    }

    // Encrypt account number
    const encryptedAccountNumber = encrypt(accountNumber);

    // Upsert onboarding record
    await prisma.influencerOnboarding.upsert({
      where: { influencerId: record.influencerId },
      create: {
        influencerId: record.influencerId,
        bankName,
        accountNumber: encryptedAccountNumber,
        accountHolder,
        bankCode: bankCode || null,
        fullName,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        postalCode,
        country,
      },
      update: {
        bankName,
        accountNumber: encryptedAccountNumber,
        accountHolder,
        bankCode: bankCode || null,
        fullName,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        postalCode,
        country,
        submittedAt: new Date(),
      },
    });

    // Mark token as used
    await prisma.onboardingToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        influencerId: record.influencerId,
        type: "onboarding",
        title: "Onboarding form submitted",
        detail: `${record.influencer.username} submitted bank details and shipping address`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/onboarding/submit]", error);
    return NextResponse.json(
      { error: "Failed to submit onboarding" },
      { status: 500 },
    );
  }
}
