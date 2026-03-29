"use client";

import { useCallback, useEffect, useState } from "react";
import { InfluencersDashboard } from "./influencers-dashboard";
import type { InfluencerRow } from "./influencers-dashboard";

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/influencers?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (isFirst) {
        setInfluencers(data.influencers ?? []);
      } else {
        setInfluencers((prev) => [...prev, ...(data.influencers ?? [])]);
      }
      setNextCursor(data.nextCursor ?? null);
      setTotalCount(data.totalCount ?? 0);
    } catch {
      if (isFirst) setInfluencers([]);
    } finally {
      if (isFirst) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(null);
  }, [fetchPage]);

  // Silently update analytics data when analysis completes (no full page reload)
  useEffect(() => {
    const handler = async (e: Event) => {
      const influencerId = (e as CustomEvent).detail;
      try {
        // Fetch fresh data silently in the background
        const res = await fetch("/api/influencers?limit=50");
        if (!res.ok) return;
        const data = await res.json();
        const fresh: InfluencerRow[] = data.influencers ?? [];
        // Merge analytics into existing list without resetting scroll/selection
        setInfluencers((prev) =>
          prev.map((inf) => {
            const updated = fresh.find((f: InfluencerRow) => f.id === inf.id);
            return updated ? { ...inf, analytics: updated.analytics } : inf;
          }),
        );
      } catch {}
    };
    window.addEventListener("analysis-complete", handler);
    return () => window.removeEventListener("analysis-complete", handler);
  }, []);

  if (loading) {
    return <InfluencersLoadingSkeleton />;
  }

  return (
    <>
      <InfluencersDashboard
        influencers={influencers}
        onRefresh={() => fetchPage(null)}
      />
      {nextCursor && (
        <div className="flex justify-center px-6 pb-6">
          <button
            onClick={() => fetchPage(nextCursor)}
            disabled={loadingMore}
            className="rounded-lg border bg-card px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading...
              </span>
            ) : (
              `Load more (${influencers.length} of ${totalCount})`
            )}
          </button>
        </div>
      )}
    </>
  );
}

function InfluencersLoadingSkeleton() {
  return (
    <div className="p-6">
      {/* Header skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-20 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border bg-card">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
