"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ScrapingSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [concurrency, setConcurrency] = useState<number>(10);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/scraping-config")
      .then((r) => r.json())
      .then((data) => {
        const n = Number(data?.concurrency);
        setConcurrency(Number.isFinite(n) ? n : 10);
        setDraft(undefined);
      })
      .catch(() => {
        toast.error("Failed to load scraping settings");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/scraping-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success("Scraping settings saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save scraping settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Scraping settings</DialogTitle>
            <DialogDescription>
              Global Apify concurrency. Applies platform-wide to every scrape:
              videos, profiles, comments.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div>
              <label
                htmlFor="concurrency"
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                Apify concurrency
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Apify concurrency info"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px] text-xs">
                    Number of Apify actor runs in flight simultaneously across
                    the entire platform. Higher = faster, but capped by your
                    Apify plan&apos;s concurrent-run limit. 1–50. Default 10.
                  </TooltipContent>
                </Tooltip>
              </label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={50}
                disabled={loading}
                value={draft ?? String(concurrency)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft === undefined) return;
                  const n = Number(draft);
                  const clamped = Number.isFinite(n) && n > 0
                    ? Math.max(1, Math.min(50, Math.floor(n)))
                    : 10;
                  setConcurrency(clamped);
                  setDraft(undefined);
                }}
                className="mt-2"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                1 = sequential, slowest. 10 = default. 50 = max.
              </p>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
