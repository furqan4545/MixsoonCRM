import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/influencers — List influencers with optional filters
export async function GET(request: NextRequest) {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const pipelineStage = searchParams.get("pipelineStage");
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "100", 10) || 100,
      500,
    );

    const where: Record<string, unknown> = {};
    if (pipelineStage) {
      where.pipelineStage = pipelineStage;
    }

    const influencers = await prisma.influencer.findMany({
      where,
      take: limit,
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        followers: true,
        platform: true,
        email: true,
        rate: true,
        pipelineStage: true,
      },
    });

    return NextResponse.json({ influencers });
  } catch (error) {
    console.error("[GET /api/influencers]", error);
    return NextResponse.json({ influencers: [] }, { status: 500 });
  }
}
