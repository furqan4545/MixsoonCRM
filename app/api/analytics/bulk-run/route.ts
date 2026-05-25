import { randomUUID } from "node:crypto";
import type { AnalysisMode } from "@prisma/client";
import { after, type NextRequest, NextResponse } from "next/server";
import { reapStaleRuns } from "@/app/lib/analysis-run-reaper";
import { runWithConcurrency } from "@/app/lib/concurrency";
import { prisma } from "../../../lib/prisma";
import { loadConfig, runAnalysisPipeline } from "../run/route";

export const maxDuration = 300;

// How many influencer analyses to run in parallel inside one bulk batch.
// Higher = faster total wall time but more Apify/Gemini concurrency and more
// memory/CPU pressure on the single Cloud Run instance handling the batch.
// 3 is the sweet spot for our current quotas — bump cautiously.
const BULK_CONCURRENCY = 3;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { influencerIds, mode: requestedMode } = body as {
    influencerIds: string[];
    mode?: AnalysisMode;
  };

  if (!influencerIds?.length) {
    return NextResponse.json(
      { error: "influencerIds[] is required" },
      { status: 400 },
    );
  }

  // Validate influencers exist
  const influencers = await prisma.influencer.findMany({
    where: { id: { in: influencerIds } },
    select: { id: true, username: true },
  });

  if (influencers.length === 0) {
    return NextResponse.json(
      { error: "No valid influencers found" },
      { status: 404 },
    );
  }

  const config = await loadConfig();
  const mode = requestedMode ?? config.defaultMode;
  const batchId = `batch_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  // Reap stalled runs across the selection so we don't refuse to re-analyze
  // influencers whose previous bulk run died with the worker.
  await Promise.all(
    influencers.map((i) => reapStaleRuns({ influencerId: i.id })),
  );

  // Skip influencers that genuinely have a fresh in-flight run
  const running = await prisma.analysisRun.findMany({
    where: {
      influencerId: { in: influencers.map((i) => i.id) },
      status: {
        in: [
          "PENDING",
          "SCRAPING_COMMENTS",
          "ANALYZING_COMMENTS",
          "ANALYZING_FACES",
        ],
      },
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
            avatarsToAnalyze: config.avatarsToAnalyze,
            commentBatchSize: config.commentBatchSize,
          },
        },
      }),
    ),
  );

  // Process with bounded concurrency in the background. Sequential processing
  // was the root cause of "spins forever" — a batch of 5+ influencers easily
  // outlived maxDuration (300s), the worker was torn down, and the un-started
  // runs stayed PENDING forever. Parallelizing shrinks total wall time AND
  // makes any stragglers reapable.
  after(async () => {
    await runWithConcurrency(runs, BULK_CONCURRENCY, async (run) => {
      try {
        await runAnalysisPipeline({
          runId: run.id,
          influencerId: run.influencerId,
          mode,
          config,
        });
      } catch (err) {
        console.error(`[Bulk Analytics] Failed for run ${run.id}:`, err);
        // Make sure the run is marked FAILED — runAnalysisPipeline normally
        // handles this, but a thrown error before its outer catch lands here.
        await prisma.analysisRun
          .update({
            where: { id: run.id },
            data: {
              status: "FAILED",
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
            },
          })
          .catch(() => {});
      }
    });

    // Notification when batch completes
    const completed = await prisma.analysisRun.count({
      where: { batchId, status: "COMPLETED" },
    });
    const failed = await prisma.analysisRun.count({
      where: { batchId, status: "FAILED" },
    });

    await prisma.notification
      .create({
        data: {
          type: "audience_analysis",
          status: failed === 0 ? "success" : "warning",
          title: `Bulk audience analysis finished`,
          message: `${completed} completed, ${failed} failed out of ${runs.length} influencers`,
        },
      })
      .catch(() => {});
  });

  return NextResponse.json({
    batchId,
    total: toAnalyze.length,
    skipped: influencers.length - toAnalyze.length,
    status: "STARTED",
    mode,
  });
}
