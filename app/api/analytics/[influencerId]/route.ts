import { type NextRequest, NextResponse } from "next/server";
import { reapStaleRuns } from "@/app/lib/analysis-run-reaper";
import { prisma } from "../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ influencerId: string }> },
) {
  const { influencerId } = await params;

  // If a previous run got orphaned, mark it FAILED before we tell the client
  // about it — otherwise the UI will reconnect SSE for a run that's dead.
  await reapStaleRuns({ influencerId });

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
