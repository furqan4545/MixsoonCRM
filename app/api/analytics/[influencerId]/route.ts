import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ influencerId: string }> },
) {
  const { influencerId } = await params;

  const [analytics, latestRun] = await Promise.all([
    prisma.influencerAnalytics.findUnique({
      where: { influencerId },
    }),
    prisma.analysisRun.findFirst({
      where: { influencerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        mode: true,
        progress: true,
        progressMsg: true,
        commentCount: true,
        avatarCount: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    analytics,
    latestRun,
  });
}
