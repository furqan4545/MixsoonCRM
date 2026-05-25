import type { AnalysisMode } from "@prisma/client";
import { after, type NextRequest, NextResponse } from "next/server";
import { reapStaleRuns } from "@/app/lib/analysis-run-reaper";
import {
  BudgetExceededError,
  checkBudgetOrThrow,
} from "@/app/lib/budget-guard";
import { prisma } from "@/app/lib/prisma";
import { loadConfig, runAnalysisPipeline } from "../../../run/route";

export const maxDuration = 300;

/**
 * Retry a failed or stalled analysis run. Creates a fresh AnalysisRun for the
 * same influencer (keeping the original mode, optionally inheriting batchId)
 * and starts the pipeline in the background. Returns the new runId.
 *
 * A run in a non-terminal state (still legitimately running) is rejected with
 * 409 — the caller can wait or cancel. A genuinely stalled run is reaped to
 * FAILED first so the retry isn't blocked.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  try {
    await checkBudgetOrThrow();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const original = await prisma.analysisRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      influencerId: true,
      mode: true,
      batchId: true,
      status: true,
    },
  });

  if (!original) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // If the run looks alive, reap stale first — if still alive after that,
  // it's a legitimate in-flight run and shouldn't be retried.
  const NON_TERMINAL = [
    "PENDING",
    "SCRAPING_COMMENTS",
    "ANALYZING_COMMENTS",
    "ANALYZING_FACES",
  ] as const;

  if ((NON_TERMINAL as readonly string[]).includes(original.status)) {
    await reapStaleRuns({ influencerId: original.influencerId });
    const refreshed = await prisma.analysisRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (
      refreshed &&
      (NON_TERMINAL as readonly string[]).includes(refreshed.status)
    ) {
      return NextResponse.json(
        {
          error: "Run is still in progress — wait for it to finish or fail",
          status: refreshed.status,
        },
        { status: 409 },
      );
    }
  }

  // Optionally let the caller override the mode (e.g. retry HYBRID failure as NLP_ONLY)
  let body: { mode?: AnalysisMode } = {};
  try {
    body = (await request.json()) as { mode?: AnalysisMode };
  } catch {
    // No body is fine — keep original mode
  }

  const config = await loadConfig();
  const mode: AnalysisMode = body.mode ?? original.mode;

  const newRun = await prisma.analysisRun.create({
    data: {
      influencerId: original.influencerId,
      status: "PENDING",
      mode,
      // Inherit batchId so the new run shows up in the same bulk progress panel
      batchId: original.batchId,
      config: {
        videosToSample: config.videosToSample,
        commentsPerVideo: config.commentsPerVideo,
        avatarsToAnalyze: config.avatarsToAnalyze,
        commentBatchSize: config.commentBatchSize,
      },
    },
  });

  after(() =>
    runAnalysisPipeline({
      runId: newRun.id,
      influencerId: original.influencerId,
      mode,
      config,
    }).catch(async (err) => {
      console.error(`[Retry] Pipeline failed for run ${newRun.id}:`, err);
      await prisma.analysisRun
        .update({
          where: { id: newRun.id },
          data: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        })
        .catch(() => {});
    }),
  );

  return NextResponse.json({
    runId: newRun.id,
    influencerId: original.influencerId,
    mode,
    status: "PENDING",
    retriedFrom: original.id,
  });
}
