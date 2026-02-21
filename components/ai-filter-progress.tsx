"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

const STORAGE_KEY = "mixsoon_active_ai_run";

interface AiFilterStatus {
  status: string;
  totalCount: number;
  processedCount: number;
  campaignName: string;
  errorMessage: string | null;
}

export function AiFilterProgress() {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<AiFilterStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setRunId(stored);
      setDismissed(false);
    }

    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setRunId(id);
      setDismissed(false);
    };
    const showHandler = (e: Event) => {
      const { type, id } = (e as CustomEvent<{ type: string; id: string }>).detail;
      if (type === "ai_filter" && id) {
        setRunId(id);
        setDismissed(false);
      }
    };
    window.addEventListener("ai-filter-started", handler);
    window.addEventListener("show-background-progress", showHandler);
    return () => {
      window.removeEventListener("ai-filter-started", handler);
      window.removeEventListener("show-background-progress", showHandler);
    };
  }, []);

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/ai/filter/runs/${runId}/status`);
        if (!res.ok) {
          localStorage.removeItem(STORAGE_KEY);
          setRunId(null);
          return;
        }

        const data: AiFilterStatus = await res.json();
        if (cancelled) return;
        setStatus(data);

        if (data.status === "COMPLETED") {
          localStorage.removeItem(STORAGE_KEY);
          toast.success("AI filter complete", {
            description: `${data.campaignName} — ${data.processedCount} influencers scored.`,
          });
          window.dispatchEvent(
            new CustomEvent("ai-filter-complete", { detail: runId }),
          );
          timerRef.current = setTimeout(() => {
            if (!cancelled) {
              setRunId(null);
              setStatus(null);
            }
          }, 8000);
          return;
        }

        if (data.status === "FAILED") {
          localStorage.removeItem(STORAGE_KEY);
          toast.error("AI filter failed", {
            description: data.errorMessage || "An error occurred.",
          });
          timerRef.current = setTimeout(() => {
            if (!cancelled) {
              setRunId(null);
              setStatus(null);
            }
          }, 10000);
          return;
        }
      } catch {
        /* retry */
      }

      if (!cancelled) {
        timerRef.current = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runId]);

  if (!runId || !status || dismissed) return null;

  const isProcessing = status.status === "PROCESSING";
  const isComplete = status.status === "COMPLETED";
  const isFailed = status.status === "FAILED";
  const pct =
    status.totalCount > 0
      ? Math.round((status.processedCount / status.totalCount) * 100)
      : 0;

  return (
    <div className="fixed bottom-40 right-4 z-40 flex flex-col gap-2">
      <div className="w-72 rounded-xl border bg-card p-3 shadow-lg">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            AI Filter
          </span>
          <div className="flex items-center gap-1">
            {runId && (
              <Link
                href={`/ai-filter/${runId}`}
                className="text-xs text-primary hover:underline"
              >
                View
              </Link>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${
              isComplete
                ? "bg-green-500"
                : isFailed
                  ? "bg-destructive"
                  : "bg-primary"
            }`}
            style={{ width: `${isComplete ? 100 : pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isProcessing &&
            `${status.processedCount} / ${status.totalCount} — ${status.campaignName}`}
          {isComplete && `${status.campaignName} complete`}
          {isFailed && (status.errorMessage || "AI filter failed")}
        </p>
      </div>
    </div>
  );
}
