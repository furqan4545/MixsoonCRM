"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "mixsoon_active_save";

interface SaveStatus {
  status: string;
  saveProgress: number;
  saveTotal: number;
  errorMessage: string | null;
}

export function SaveProgressBar() {
  const [importId, setImportId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setImportId(stored);
      setDismissed(false);
    }

    const handler = (e: Event) => {
      const importId = (e as CustomEvent<string>).detail;
      setImportId(importId);
      setDismissed(false);
    };
    const showHandler = (e: Event) => {
      const { type, id } = (e as CustomEvent<{ type: string; id: string }>).detail;
      if (type === "save" && id) {
        setImportId(id);
        setDismissed(false);
      }
    };
    window.addEventListener("save-import-started", handler);
    window.addEventListener("show-background-progress", showHandler);
    return () => {
      window.removeEventListener("save-import-started", handler);
      window.removeEventListener("show-background-progress", showHandler);
    };
  }, []);

  useEffect(() => {
    if (!importId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/imports/${importId}/save/status`);
        if (!res.ok) {
          localStorage.removeItem(STORAGE_KEY);
          setImportId(null);
          return;
        }

        const data: SaveStatus = await res.json();
        if (cancelled) return;
        setStatus(data);

        if (data.status === "COMPLETED") {
          localStorage.removeItem(STORAGE_KEY);
          toast.success("Save to cloud complete", {
            description: "All images cached to cloud storage.",
          });
          window.dispatchEvent(
            new CustomEvent("save-import-complete", { detail: importId }),
          );
          timerRef.current = setTimeout(() => {
            if (!cancelled) {
              setImportId(null);
              setStatus(null);
            }
          }, 6000);
          return;
        }

        if (data.status === "DRAFT" || data.status === "FAILED") {
          localStorage.removeItem(STORAGE_KEY);
          toast.error("Save to cloud failed", {
            description: data.errorMessage || "An error occurred.",
          });
          timerRef.current = setTimeout(() => {
            if (!cancelled) {
              setImportId(null);
              setStatus(null);
            }
          }, 8000);
          return;
        }
      } catch {
        /* retry on network error */
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
  }, [importId]);

  useEffect(() => {
    if (!importId || !status || status.status !== "PROCESSING") return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importId, status]);

  if (!importId || !status || dismissed) return null;

  const isProcessing = status.status === "PROCESSING";
  const isComplete = status.status === "COMPLETED";
  const isFailed =
    status.status === "DRAFT" || status.status === "FAILED";
  const pct =
    status.saveTotal > 0
      ? Math.round((status.saveProgress / status.saveTotal) * 100)
      : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border bg-card p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {isProcessing && "Saving to cloud..."}
          {isComplete && "Save complete!"}
          {isFailed && "Save failed"}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
          `${status.saveProgress} / ${status.saveTotal} influencers`}
        {isComplete && "All images cached to cloud storage"}
        {isFailed && (status.errorMessage || "An error occurred")}
      </p>
    </div>
  );
}

export function startSaveImport(importId: string) {
  localStorage.setItem(STORAGE_KEY, importId);
  toast.info("Saving to cloud…", {
    description: "You can navigate away. Progress appears in the corner.",
  });
  window.dispatchEvent(
    new CustomEvent("save-import-started", { detail: importId }),
  );
}
