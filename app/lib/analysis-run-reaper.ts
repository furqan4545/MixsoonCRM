import type { AnalysisRunStatus } from "@prisma/client";
import { prisma } from "./prisma";

// A run is "stale" if it's in a non-terminal state and hasn't been touched
// (updatedAt bumped) in this long. The pipeline heartbeats updatedAt during
// Apify polling, NLP batches, and avatar batches — so genuine in-flight work
// will keep this fresh. Anything beyond this window is almost certainly an
// orphaned `after()` worker that died with the request handler.
//
// 8 minutes covers: a slow Apify cold start (~2-3min), a long Gemini batch
// (~1min), and a margin for transient network blips. Tune up if you see
// healthy runs getting falsely reaped; tune down for faster failure feedback.
export const STALE_AFTER_MS = 8 * 60 * 1000;

const NON_TERMINAL: AnalysisRunStatus[] = [
  "PENDING",
  "SCRAPING_COMMENTS",
  "ANALYZING_COMMENTS",
  "ANALYZING_FACES",
];

export type ReapFilter =
  | { influencerId: string }
  | { batchId: string }
  | { all: true };

/**
 * Mark non-terminal AnalysisRuns whose updatedAt is older than STALE_AFTER_MS
 * as FAILED. Returns the count reaped. Safe to call frequently — it's a single
 * UPDATE keyed on (status, updatedAt).
 */
export async function reapStaleRuns(filter: ReapFilter): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);

  const where: Parameters<typeof prisma.analysisRun.updateMany>[0]["where"] = {
    status: { in: NON_TERMINAL },
    updatedAt: { lt: cutoff },
  };
  if ("influencerId" in filter) where.influencerId = filter.influencerId;
  if ("batchId" in filter) where.batchId = filter.batchId;

  const result = await prisma.analysisRun.updateMany({
    where,
    data: {
      status: "FAILED",
      errorMessage:
        "Analysis stalled — the background worker stopped responding. Retry to start a fresh run.",
      progressMsg: "Stalled (no progress for several minutes)",
    },
  });

  if (result.count > 0) {
    console.warn(
      `[Reaper] Marked ${result.count} stalled run(s) as FAILED`,
      filter,
    );
  }
  return result.count;
}

/**
 * Bump a run's updatedAt to "now" without changing its status. Use this from
 * long-running steps (Apify poll loop, NLP batches) so the reaper doesn't
 * mistake healthy work for a stalled run. Errors are swallowed — a missed
 * heartbeat is recoverable (the reaper window is generous), but throwing here
 * would kill the analysis.
 */
export async function touchRun(runId: string): Promise<void> {
  await prisma.analysisRun
    .update({
      where: { id: runId },
      data: { updatedAt: new Date() },
    })
    .catch(() => {});
}
