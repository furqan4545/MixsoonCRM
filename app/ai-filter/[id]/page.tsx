"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Evaluation = {
  id: string;
  score: number | null;
  bucket: "APPROVED" | "OKISH" | "REJECTED" | "REVIEW_QUEUE";
  reasons: string | null;
  matchedSignals: string | null;
  riskSignals: string | null;
  reviewStatus: "NOT_REVIEWED" | "APPROVED_FOR_AI" | "DISCARDED";
  influencer: {
    id: string;
    username: string;
    followers: number | null;
    profileUrl: string | null;
  };
};

type RunResponse = {
  id: string;
  status: string;
  strictness: number;
  createdAt: string;
  approvedCount: number;
  okishCount: number;
  rejectedCount: number;
  reviewQueueCount: number;
  campaign: {
    id: string;
    name: string;
  };
  import: { id: string; sourceFilename: string } | null;
  evaluations: Evaluation[];
};

export default function AiFilterRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;

  const [run, setRun] = useState<RunResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRun = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ai/filter/runs/${runId}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load run");
      setRun(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const reviewQueue = useMemo(
    () =>
      (run?.evaluations ?? []).filter(
        (e) => e.bucket === "REVIEW_QUEUE" && e.reviewStatus === "NOT_REVIEWED",
      ),
    [run],
  );
  const approved = useMemo(
    () => (run?.evaluations ?? []).filter((e) => e.bucket === "APPROVED"),
    [run],
  );
  const okish = useMemo(
    () => (run?.evaluations ?? []).filter((e) => e.bucket === "OKISH"),
    [run],
  );
  const rejected = useMemo(
    () => (run?.evaluations ?? []).filter((e) => e.bucket === "REJECTED"),
    [run],
  );

  async function applyReview(action: "approve" | "discard") {
    if (selectedReviewIds.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/ai/filter/runs/${runId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { approveIds: selectedReviewIds, discardIds: [] }
            : { approveIds: [], discardIds: selectedReviewIds },
        ),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Review action failed");
      setSelectedReviewIds([]);
      await loadRun();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading AI filter run...
      </div>
    );
  }
  if (error || !run) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error || "Run not found"}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">AI Filter Run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {run.campaign.name} · strictness {run.strictness}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {run.import && (
            <Link href={`/imports/${run.import.id}`} className="underline">
              Import: {run.import.sourceFilename}
            </Link>
          )}
          <Badge variant="default">Approved {run.approvedCount}</Badge>
          <Badge variant="secondary">Okish {run.okishCount}</Badge>
          <Badge variant="destructive">Rejected {run.rejectedCount}</Badge>
          <Badge variant="outline">Review queue {run.reviewQueueCount}</Badge>
        </div>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Manual review queue</h2>
          <span className="text-xs text-muted-foreground">
            Select rows then approve for AI or discard
          </span>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending review items.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {reviewQueue.map((row) => (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedReviewIds.includes(row.id)}
                    onChange={(e) => {
                      setSelectedReviewIds((prev) =>
                        e.target.checked
                          ? [...prev, row.id]
                          : prev.filter((id) => id !== row.id),
                      );
                    }}
                  />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      @{row.influencer.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.reasons}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={selectedReviewIds.length === 0 || actionLoading}
                onClick={() => applyReview("approve")}
              >
                {actionLoading ? "Processing..." : "Approve Selected For AI"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedReviewIds.length === 0 || actionLoading}
                onClick={() => applyReview("discard")}
              >
                Discard Selected
              </Button>
            </div>
          </>
        )}
      </div>

      <section className="space-y-4">
        <BucketList title="Approved" rows={approved} variant="default" />
        <BucketList title="Okish" rows={okish} variant="secondary" />
        <BucketList title="Rejected" rows={rejected} variant="destructive" />
      </section>
    </div>
  );
}

function BucketList({
  title,
  rows,
  variant,
}: {
  title: string;
  rows: Evaluation[];
  variant: "default" | "secondary" | "destructive";
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-semibold">{title}</p>
        <Badge variant={variant}>{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          No influencers in this bucket.
        </p>
      ) : (
        <div className="space-y-2 p-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/influencers/${row.influencer.id}`}
                    className="font-medium hover:underline"
                  >
                    @{row.influencer.username}
                  </Link>
                  {row.influencer.profileUrl && (
                    <a
                      href={row.influencer.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      TikTok
                    </a>
                  )}
                </div>
                <div className="text-sm">Score: {row.score ?? "—"}</div>
              </div>
              {row.reasons && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.reasons}
                </p>
              )}
              {(row.matchedSignals || row.riskSignals) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.matchedSignals
                    ? `Matched: ${row.matchedSignals}`
                    : "Matched: —"}
                  {" · "}
                  {row.riskSignals ? `Risk: ${row.riskSignals}` : "Risk: —"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
