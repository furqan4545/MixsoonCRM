import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// POST /api/onboarding/generate-link — Generate a magic link for influencer onboarding
export async function POST(request: Request) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { influencerId, type = "ONBOARDING", contractId = null } = body;

    if (!influencerId) {
      return NextResponse.json(
        { error: "influencerId is required" },
        { status: 400 },
      );
    }

    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      select: { id: true, username: true },
    });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 },
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.onboardingToken.create({
      data: {
        token,
        influencerId,
        type,
        contractId: type === "CONTRACT" ? contractId : null,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const portalPath = type === "CONTRACT" ? "contract" : "onboard";
    const url = `${baseUrl}/portal/${portalPath}/${token}`;

    return NextResponse.json({ token, url });
  } catch (error) {
    console.error("[POST /api/onboarding/generate-link]", error);
    return NextResponse.json(
      { error: "Failed to generate link" },
      { status: 500 },
    );
  }
}
