"use client";

import { Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { isSaveStoppedMessage } from "@/app/lib/import-save";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SAVE_KEY = "mixsoon_active_save";
const AI_RUN_KEY = "mixsoon_active_ai_run";

type SaveStatus = {
  status: string;
  saveProgress: number;
  saveTotal: number;
  errorMessage: string | null;
  stopRequested?: boolean;
};

type AiStatus = {
  status: string;
  totalCount: number;
  processedCount: number;
  campaignName: string;
  errorMessage: string | null;
};

export function BackgroundJobsButton() {
  const [open, setOpen] = useState(false);
  const [saveId, setSaveId] = useState<string | null>(null);
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [stoppingSave, setStoppingSave] = useState(false);

  const refresh = useCallback(() => {
    setSaveId(localStorage.getItem(SAVE_KEY));
    setAiRunId(localStorage.getItem(AI_RUN_KEY));
  }, []);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("save-import-started", refresh);
    window.addEventListener("ai-filter-started", refresh);
    window.addEventListener("save-import-complete", refresh);
    window.addEventListener("ai-filter-complete", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("save-import-started", refresh);
      window.removeEventListener("ai-filter-started", refresh);
      window.removeEventListener("save-import-complete", refresh);
      window.removeEventListener("ai-filter-complete", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    refresh();
    if (saveId) {
      fetch(`/api/imports/${saveId}/save/status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setSaveStatus(d))
        .catch(() => {});
    } else {
      setSaveStatus(null);
    }
    if (aiRunId) {
      fetch(`/api/ai/filter/runs/${aiRunId}/status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setAiStatus(d))
        .catch(() => {});
    } else {
      setAiStatus(null);
    }
  }, [open, saveId, aiRunId, refresh]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      if (saveId) {
        fetch(`/api/imports/${saveId}/save/status`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setSaveStatus(d))
          .catch(() => {});
      }
      if (aiRunId) {
        fetch(`/api/ai/filter/runs/${aiRunId}/status`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setAiStatus(d))
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(t);
  }, [open, saveId, aiRunId]);

  const showSave = () => {
    if (saveId) {
      window.dispatchEvent(
        new CustomEvent("show-background-progress", {
          detail: { type: "save", id: saveId },
        }),
      );
      setOpen(false);
    }
  };

  const stopSave = async () => {
    if (!saveId || stoppingSave) return;
    setStoppingSave(true);
    try {
      const res = await fetch(`/api/imports/${saveId}/save/stop`, {
        method: "POST",
      });
      if (!res.ok) return;
      setSaveStatus((prev) => (prev ? { ...prev, stopRequested: true } : prev));
    } finally {
      setStoppingSave(false);
    }
  };

  const hasActive = saveId || aiRunId;
  if (!hasActive) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 hover:bg-muted"
          aria-label="Background jobs"
        >
          <Activity className="h-5 w-5 text-primary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Background jobs
        </div>
        {saveId && (
          <div className="flex items-center justify-between gap-2 border-b px-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Save to cloud</p>
              <p className="text-xs text-muted-foreground">
                {saveStatus
                  ? saveStatus.status === "PROCESSING" &&
                    saveStatus.stopRequested
                    ? `Stopping… ${saveStatus.saveProgress} / ${saveStatus.saveTotal}`
                    : saveStatus.status === "DRAFT" &&
                        isSaveStoppedMessage(saveStatus.errorMessage)
                      ? "Stopped"
                      : `${saveStatus.saveProgress} / ${saveStatus.saveTotal}`
                  : "…"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {saveStatus?.status === "PROCESSING" && (
                <button
                  type="button"
                  onClick={stopSave}
                  disabled={stoppingSave || saveStatus.stopRequested}
                  className="text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveStatus.stopRequested ? "Stopping" : "Stop"}
                </button>
              )}
              <button
                type="button"
                onClick={showSave}
                className="text-xs text-primary hover:underline"
              >
                Show
              </button>
            </div>
          </div>
        )}
        {aiRunId && (
          <div className="px-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">AI filter</p>
              <p className="text-xs text-muted-foreground">
                {aiStatus
                  ? `${aiStatus.processedCount} / ${aiStatus.totalCount} — ${aiStatus.campaignName}`
                  : "…"}
              </p>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
