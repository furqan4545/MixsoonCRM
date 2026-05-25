"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// LocalStorage key — must match what the dashboard writes when a bulk run starts.
export const BULK_RUN_STORAGE_KEY = "mixsoon_active_bulk_analysis";

interface BulkRunStatus {
  id: string;
  username: string;
  status:
    | "PENDING"
    | "SCRAPING_COMMENTS"
    | "ANALYZING_COMMENTS"
    | "ANALYZING_FACES"
    | "COMPLETED"
    | "FAILED";
  progress: number;
  errorMessage: string | null;
}

interface BulkStatusResponse {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  pending: number;
  done: boolean;
  current: {
    username: string;
    status: string;
    progress: number;
    progressMsg: string | null;
  } | null;
  runs: BulkRunStatus[];
}

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

const STATUS_LABEL: Record<BulkRunStatus["status"], string> = {
  PENDING: "Queued",
  SCRAPING_COMMENTS: "Scraping",
  ANALYZING_COMMENTS: "Analyzing comments",
  ANALYZING_FACES: "Analyzing avatars",
  COMPLETED: "Done",
  FAILED: "Failed",
};

interface Props {
  batchId: string;
  onDone?: (summary: { completed: number; failed: number }) => void;
  onDismiss: () => void;
}

export function BulkAnalysisProgressPanel({
  batchId,
  onDone,
  onDismiss,
}: Props) {
  const [data, setData] = useState<BulkStatusResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [retryingAll, setRetryingAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against double-firing onDone if the poller and a retry both flip
  // the batch to done in the same tick.
  const doneFiredRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/bulk-status/${batchId}`);
      if (!res.ok) {
        if (res.status === 404) {
          // Batch was reaped or never existed — clear panel.
          onDismiss();
        }
        return;
      }
      const json = (await res.json()) as BulkStatusResponse;
      setData(json);

      if (json.done && !doneFiredRef.current) {
        doneFiredRef.current = true;
        onDone?.({ completed: json.completed, failed: json.failed });
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (!json.done && doneFiredRef.current) {
        // A retry brought the batch back to active — re-arm.
        doneFiredRef.current = false;
        if (!pollRef.current) {
          pollRef.current = setInterval(fetchStatus, 3000);
        }
      }
    } catch {
      // Transient — next tick will retry
    }
  }, [batchId, onDismiss, onDone]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [fetchStatus]);

  const retryOne = async (runId: string) => {
    setRetrying((prev) => new Set(prev).add(runId));
    try {
      const res = await fetch(`/api/analytics/runs/${runId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Retry failed");
      }
      toast.success("Retry started");
      // Force an immediate refresh so the new run shows up
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  };

  const retryAllFailed = async () => {
    if (!data) return;
    const failed = data.runs.filter((r) => r.status === "FAILED");
    if (failed.length === 0) return;

    setRetryingAll(true);
    try {
      const results = await Promise.allSettled(
        failed.map((r) =>
          fetch(`/api/analytics/runs/${r.id}/retry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error ?? `Retry failed (${res.status})`);
            }
          }),
        ),
      );
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const errCount = results.length - okCount;
      if (errCount === 0) {
        toast.success(`Retrying ${okCount} failed analysis run(s)`);
      } else {
        toast.warning(
          `Retried ${okCount}/${results.length} — ${errCount} couldn't restart`,
        );
      }
      fetchStatus();
    } finally {
      setRetryingAll(false);
    }
  };

  if (!data) {
    return null;
  }

  const failedRuns = data.runs.filter((r) => r.status === "FAILED");
  const activeRuns = data.runs.filter((r) => !TERMINAL.has(r.status));
  const isDone = data.done;
  const inProgressPct =
    data.total > 0
      ? Math.round(((data.completed + data.failed) / data.total) * 100)
      : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] overflow-hidden rounded-xl border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isDone ? (
            data.failed > 0 ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-600" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {isDone
                ? data.failed > 0
                  ? `Finished: ${data.completed} done, ${data.failed} failed`
                  : `All ${data.completed} analyzed`
                : `Analyzing ${data.total} influencers`}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {isDone
                ? `Batch ${batchId.replace(/^batch_/, "").slice(0, 8)}`
                : `${data.completed + data.failed}/${data.total} processed (${inProgressPct}%)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1 hover:bg-muted"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 hover:bg-muted"
            title="Dismiss"
            disabled={!isDone}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Overall progress bar */}
          <div className="px-3 py-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-purple-600 transition-all duration-500"
                style={{ width: `${inProgressPct}%` }}
              />
            </div>
          </div>

          {/* Currently-processing line */}
          {!isDone && data.current && (
            <div className="border-t bg-muted/20 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  @{data.current.username}
                </span>
                {" — "}
                {data.current.progressMsg ??
                  STATUS_LABEL[
                    data.current.status as BulkRunStatus["status"]
                  ] ??
                  data.current.status}
              </p>
            </div>
          )}

          {/* Per-influencer list */}
          <div className="max-h-[280px] overflow-y-auto border-t">
            {data.runs.map((run) => {
              const isRetrying = retrying.has(run.id);
              return (
                <div
                  key={run.id}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                >
                  <span className="shrink-0">
                    {run.status === "COMPLETED" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {run.status === "FAILED" && (
                      <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    )}
                    {!TERMINAL.has(run.status) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      @{run.username}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {STATUS_LABEL[run.status]}
                      {run.status === "FAILED" && run.errorMessage
                        ? ` — ${run.errorMessage}`
                        : ""}
                      {!TERMINAL.has(run.status) && run.progress > 0
                        ? ` (${run.progress}%)`
                        : ""}
                    </p>
                  </div>
                  {run.status === "FAILED" && (
                    <button
                      type="button"
                      onClick={() => retryOne(run.id)}
                      disabled={isRetrying}
                      className="flex shrink-0 items-center gap-1 rounded border border-red-300 bg-white px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                      title="Retry this analysis"
                    >
                      {isRetrying ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-2.5 w-2.5" />
                      )}
                      Retry
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          {(failedRuns.length > 0 || activeRuns.length === 0) && (
            <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                {failedRuns.length > 0
                  ? `${failedRuns.length} failed`
                  : "All processed"}
              </p>
              {failedRuns.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={retryAllFailed}
                  disabled={retryingAll}
                  className="h-7 gap-1 text-[11px]"
                >
                  {retryingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Retry all failed
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
