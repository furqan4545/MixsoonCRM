import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// GET /api/onboarding/verify?token=xxx — Public: validate a magic link token
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const record = await prisma.onboardingToken.findUnique({
    where: { token },
    include: {
      influencer: {
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (record.usedAt) {
    return NextResponse.json(
      { error: "This link has already been used", used: true },
      { status: 410 },
    );
  }

  if (record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "This link has expired", expired: true },
      { status: 410 },
    );
  }

  // Check if onboarding was already submitted
  const existing = await prisma.influencerOnboarding.findUnique({
    where: { influencerId: record.influencerId },
  });

  return NextResponse.json({
    valid: true,
    type: record.type,
    influencer: record.influencer,
    alreadySubmitted: !!existing,
  });
}
