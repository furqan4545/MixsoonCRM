"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/thumbnail-image";

type SavedEvaluation = {
  id: string;
  score: number | null;
  bucket: "APPROVED" | "OKISH" | "REJECTED";
  reasons: string | null;
  matchedSignals: string | null;
  riskSignals: string | null;
  runId: string;
  influencer: {
    id: string;
    username: string;
    profileUrl: string | null;
    avatarUrl: string | null;
    followers: number | null;
    email: string | null;
    biolink: string | null;
  };
  run: {
    id: string;
    campaign: { id: string; name: string };
  };
};

type Tab = "APPROVED" | "OKISH" | "REJECTED";

function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function QueuesPage() {
  const [evaluations, setEvaluations] = useState<SavedEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("APPROVED");

  const loadQueues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/queues");
      const data: SavedEvaluation[] = await res.json();
      setEvaluations(data);
    } catch {
      console.error("Failed to load queues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  async function removeFromQueue(evalId: string) {
    setEvaluations((prev) => prev.filter((e) => e.id !== evalId));
    await fetch(`/api/ai/queues/${evalId}`, { method: "DELETE" });
  }

  const filtered = evaluations.filter((e) => e.bucket === tab);
  const approvedCount = evaluations.filter((e) => e.bucket === "APPROVED").length;
  const okishCount = evaluations.filter((e) => e.bucket === "OKISH").length;
  const rejectedCount = evaluations.filter((e) => e.bucket === "REJECTED").length;

  const tabs: { key: Tab; label: string; count: number; variant: "default" | "secondary" | "destructive" }[] = [
    { key: "APPROVED", label: "Approved", count: approvedCount, variant: "default" },
    { key: "OKISH", label: "Okish", count: okishCount, variant: "secondary" },
    { key: "REJECTED", label: "Rejected", count: rejectedCount, variant: "destructive" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Queues</h1>
        <p className="text-sm text-muted-foreground">
          Saved influencers from AI filtering, organized by bucket.
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {t.label}
            <Badge variant={t.variant} className="ml-1">
              {t.count}
            </Badge>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Loading queues...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-muted-foreground">
            No saved influencers in the {tab.toLowerCase()} queue.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run AI filtering on an import, then save a bucket to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ev) => (
            <div
              key={ev.id}
              className="rounded-xl border bg-card p-4"
            >
              <div className="flex items-start gap-4">
                {ev.influencer.avatarUrl ? (
                  <ThumbnailImage
                    src={fixThumbnailUrl(ev.influencer.avatarUrl)!}
                    alt={ev.influencer.username}
                    className="h-12 w-12 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {ev.influencer.username.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/influencers/${ev.influencer.id}`}
                      className="font-semibold hover:underline"
                    >
                      @{ev.influencer.username}
                    </Link>
                    {ev.influencer.profileUrl && (
                      <a
                        href={ev.influencer.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        TikTok
                      </a>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Score: {ev.score ?? "—"}
                    </Badge>
                  </div>

                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatNumber(ev.influencer.followers)} followers</span>
                    {ev.influencer.email && <span>{ev.influencer.email}</span>}
                    <span className="text-muted-foreground/50">
                      Campaign: {ev.run.campaign.name}
                    </span>
                  </div>

                  {ev.reasons && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {ev.reasons}
                    </p>
                  )}

                  {(ev.matchedSignals || ev.riskSignals) && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {ev.matchedSignals ? `Matched: ${ev.matchedSignals}` : ""}
                      {ev.matchedSignals && ev.riskSignals ? " · " : ""}
                      {ev.riskSignals ? `Risk: ${ev.riskSignals}` : ""}
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeFromQueue(ev.id)}
                  className="shrink-0"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
