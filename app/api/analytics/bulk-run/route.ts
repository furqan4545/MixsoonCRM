import { after, type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { loadConfig, runAnalysisPipeline } from "../run/route";
import type { AnalysisMode } from "@prisma/client";
import { randomUUID } from "crypto";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { influencerIds, mode: requestedMode } = body as {
    influencerIds: string[];
    mode?: AnalysisMode;
  };

  if (!influencerIds?.length) {
    return NextResponse.json({ error: "influencerIds[] is required" }, { status: 400 });
  }

  // Validate influencers exist
  const influencers = await prisma.influencer.findMany({
    where: { id: { in: influencerIds } },
    select: { id: true, username: true },
  });

  if (influencers.length === 0) {
    return NextResponse.json({ error: "No valid influencers found" }, { status: 404 });
  }

  const config = await loadConfig();
  const mode = requestedMode ?? config.defaultMode;
  const batchId = `batch_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // Skip influencers that already have a running analysis
  const running = await prisma.analysisRun.findMany({
    where: {
      influencerId: { in: influencers.map((i) => i.id) },
      status: { in: ["PENDING", "SCRAPING_COMMENTS", "ANALYZING_COMMENTS", "ANALYZING_FACES"] },
    },
    select: { influencerId: true },
  });
  const runningIds = new Set(running.map((r) => r.influencerId));
  const toAnalyze = influencers.filter((i) => !runningIds.has(i.id));

  if (toAnalyze.length === 0) {
    return NextResponse.json({
      batchId,
      total: 0,
      skipped: influencers.length,
      message: "All selected influencers already have analysis in progress",
    });
  }

  // Create one AnalysisRun per influencer
  const runs = await prisma.$transaction(
    toAnalyze.map((inf) =>
      prisma.analysisRun.create({
        data: {
          influencerId: inf.id,
          status: "PENDING",
          mode,
          batchId,
          config: {
            videosToSample: config.videosToSample,
            commentsPerVideo: config.commentsPerVideo,
            maxTotalComments: config.maxTotalComments,
            avatarsToAnalyze: config.avatarsToAnalyze,
            commentBatchSize: config.commentBatchSize,
          },
        },
      }),
    ),
  );

  // Process sequentially in background
  after(async () => {
    for (const run of runs) {
      try {
        await runAnalysisPipeline({
          runId: run.id,
          influencerId: run.influencerId,
          mode,
          config,
        });
      } catch (err) {
        console.error(`[Bulk Analytics] Failed for run ${run.id}:`, err);
      }
    }

    // Notification when batch completes
    const completed = await prisma.analysisRun.count({
      where: { batchId, status: "COMPLETED" },
    });
    const failed = await prisma.analysisRun.count({
      where: { batchId, status: "FAILED" },
    });

    await prisma.notification.create({
      data: {
        type: "audience_analysis",
        status: failed === 0 ? "success" : "warning",
        title: `Bulk audience analysis finished`,
        message: `${completed} completed, ${failed} failed out of ${runs.length} influencers`,
      },
    }).catch(() => {});
  });

  return NextResponse.json({
    batchId,
    total: toAnalyze.length,
    skipped: influencers.length - toAnalyze.length,
    status: "STARTED",
    mode,
  });
}
