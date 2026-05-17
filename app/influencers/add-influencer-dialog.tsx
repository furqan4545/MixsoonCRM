"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// Resolve the freshly-added influencer's DB id so the dashboard can auto-select
// the row. Best-effort — returns null if the lookup fails for any reason.
async function lookupInfluencerId(username: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/influencers?search=${encodeURIComponent(username)}&limit=10`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      influencers?: Array<{ id: string; username: string }>;
    };
    const match = (data.influencers ?? []).find(
      (i) => i.username.toLowerCase() === username.toLowerCase(),
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the influencer is created. `newInfluencerId` is the DB id when we
   *  could resolve it (so the parent can auto-select the row); may be null. */
  onSuccess: (newInfluencerId: string | null, username: string) => void;
}

export function AddInfluencerDialog({ open, onOpenChange, onSuccess }: Props) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const reset = () => {
    setInput("");
    setSubmitting(false);
    setProgress("");
    setProgressCurrent(0);
    setProgressTotal(0);
  };

  const handleClose = (next: boolean) => {
    // Always allow closing. The scrape continues in the background; we just
    // detach from the dialog and let the success handler fire whenever it
    // completes (it'll auto-select the new row in the list).
    if (!next && !submitting) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const value = input.trim();
    if (!value || submitting) return;

    setSubmitting(true);
    setProgress("Validating handle…");

    try {
      // Step 1 — validate + create synthetic Import record (mirrors CSV flow)
      const createRes = await fetch("/api/influencers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrUrl: value, videoCount: 20 }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not validate handle");
      }

      const createData = await createRes.json();
      const { id: importId, toScrape, toRescrape, skipped, videoCount, username, alreadyExists } =
        createData as {
          id: string;
          toScrape: string[];
          toRescrape: string[];
          skipped: string[];
          videoCount: number;
          username: string;
          alreadyExists: boolean;
        };

      setProgress(
        alreadyExists
          ? `@${username} already exists — refreshing data…`
          : `Fetching @${username}'s profile and videos…`,
      );

      // Step 2 — hand off to the existing /api/scrape SSE pipeline
      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId, toScrape, toRescrape, skipped, videoCount }),
      });

      if (!scrapeRes.ok) {
        const err = await scrapeRes.json().catch(() => ({}));
        throw new Error(err.error ?? err.details ?? "Scrape failed");
      }

      const contentType = scrapeRes.headers.get("content-type") ?? "";
      // Non-SSE response = "Nothing to scrape" (e.g. already has enough videos).
      if (!contentType.includes("text/event-stream")) {
        await scrapeRes.json().catch(() => ({}));
        toast.success(`@${username} added`);
        const newId = await lookupInfluencerId(username);
        reset();
        onOpenChange(false);
        onSuccess(newId, username);
        return;
      }

      // Stream the SSE progress
      const reader = scrapeRes.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No SSE body");

      let buffer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "progress") {
              setProgressCurrent(Number(payload.processed) || 0);
              setProgressTotal(Number(payload.total) || 0);
              setProgress(
                `Scraping @${payload.username ?? username} (${payload.processed} / ${payload.total})`,
              );
            } else if (payload.type === "stage") {
              setProgress(payload.message ?? "Working…");
            }
          } catch {
            // Ignore non-JSON lines (e.g., heartbeat)
          }
        }
      }

      toast.success(`@${username} added`, {
        description: alreadyExists ? "Profile refreshed" : "Profile and videos fetched",
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      });
      const newId = await lookupInfluencerId(username);
      reset();
      onOpenChange(false);
      onSuccess(newId, username);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add influencer";
      toast.error(msg);
      setProgress("");
      setSubmitting(false);
    }
  };

  const pct =
    progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Influencer</DialogTitle>
          <DialogDescription>
            Paste a TikTok handle or profile URL. We'll fetch the profile and videos automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-influencer-input">Username or URL</Label>
            <Input
              id="add-influencer-input"
              placeholder="@brookemonk_  or  https://tiktok.com/@brookemonk_"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) handleSubmit();
              }}
            />
          </div>

          {submitting && (
            <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <span className="truncate text-foreground">{progress || "Working…"}</span>
              </div>
              {progressTotal > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-300 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            {submitting ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={!input.trim() || submitting}>
            {submitting ? "Adding…" : "Add Influencer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
