import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;

  const runs = await prisma.analysisRun.findMany({
    where: { batchId },
    select: {
      id: true,
      influencerId: true,
      status: true,
      progress: true,
      progressMsg: true,
      errorMessage: true,
      influencer: { select: { username: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (runs.length === 0) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const total = runs.length;
  const completed = runs.filter((r) => r.status === "COMPLETED").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;
  const pending = total - completed - failed;

  // Find the currently processing one
  const current = runs.find((r) =>
    ["PENDING", "SCRAPING_COMMENTS", "ANALYZING_COMMENTS", "ANALYZING_FACES"].includes(r.status),
  );

  const done = pending === 0;

  return NextResponse.json({
    batchId,
    total,
    completed,
    failed,
    pending,
    done,
    current: current
      ? {
          username: current.influencer.username,
          status: current.status,
          progress: current.progress,
          progressMsg: current.progressMsg,
        }
      : null,
    runs: runs.map((r) => ({
      id: r.id,
      username: r.influencer.username,
      status: r.status,
      progress: r.progress,
      errorMessage: r.errorMessage,
    })),
  });
}
