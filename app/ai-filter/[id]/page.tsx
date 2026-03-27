"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BUCKET_COLORS: Record<string, { bg: string; text: string; border: string; hover: string }> = {
  APPROVED: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300", hover: "hover:bg-emerald-100" },
  OKISH: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300", hover: "hover:bg-amber-100" },
  REJECTED: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", hover: "hover:bg-red-100" },
};

const BUCKET_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  OKISH: "Ok-ish",
  REJECTED: "Rejected",
};

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
    displayName: string | null;
    followers: number | null;
    profileUrl: string | null;
    avatarUrl: string | null;
    platform: string | null;
    engagementRate: number | null;
    language: string | null;
    country: string | null;
    pipelineStage: string;
    tags: string[];
    email: string | null;
    videos: { id: string; title: string | null; views: number | null; thumbnailUrl: string | null; videoUrl: string | null }[];
    analytics: {
      influencerGender: string | null;
      influencerAgeRange: string | null;
      influencerEthnicity: string | null;
      influencerCountry: string | null;
      lastAnalyzedAt: string | null;
      mode: string | null;
      confidence: number | null;
    } | null;
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
  const [bucketAction, setBucketAction] = useState<string | null>(null);
  const [selectedInfluencerId, setSelectedInfluencerId] = useState<string | null>(null);

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

  // Load initially, then poll every 3s while PROCESSING
  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  useEffect(() => {
    if (!run || run.status !== "PROCESSING") return;
    const interval = setInterval(() => void loadRun(), 3000);
    return () => clearInterval(interval);
  }, [run?.status, loadRun]);

  // Also listen for completion event from the progress widget
  useEffect(() => {
    const handler = (e: Event) => {
      const completedId = (e as CustomEvent<string>).detail;
      if (completedId === runId) void loadRun();
    };
    window.addEventListener("ai-filter-complete", handler);
    return () => window.removeEventListener("ai-filter-complete", handler);
  }, [runId, loadRun]);

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

  async function handleBucketAction(
    bucket: "APPROVED" | "OKISH" | "REJECTED",
    action: "save" | "delete",
  ) {
    setBucketAction(`${action}-${bucket}`);
    try {
      const res = await fetch(`/api/ai/filter/runs/${runId}/bucket`, {
        method: action === "save" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || `Failed to ${action} bucket`);
      }
      await loadRun();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} bucket`);
    } finally {
      setBucketAction(null);
    }
  }

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

  async function moveEval(evalId: string, targetBucket: string) {
    try {
      const res = await fetch(`/api/ai/queues/${evalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: targetBucket }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Moved to ${BUCKET_LABELS[targetBucket] || targetBucket}`);
      await loadRun();
    } catch {
      toast.error("Failed to move influencer");
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

  const isProcessing = run.status === "PROCESSING";

  return (
    <div className="flex h-full">
    <div className={`flex-1 overflow-y-auto p-6 ${selectedInfluencerId ? "max-w-[60%]" : ""}`}>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">AI Filter Run</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {run.campaign.name} · strictness {run.strictness}
        </p>
        {isProcessing && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
            <span className="text-sm font-medium text-blue-800">
              Processing… {run.evaluations.length} of {run.evaluations.length} scored so far (auto-refreshing)
            </span>
          </div>
        )}
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
        <BucketList
          title="Approved"
          bucket="APPROVED"
          rows={approved}
          variant="default"
          onSave={() => handleBucketAction("APPROVED", "save")}
          onDelete={() => handleBucketAction("APPROVED", "delete")}
          onMoveEval={moveEval}
          actionLoading={bucketAction}
          onSelectInfluencer={setSelectedInfluencerId}
          selectedInfluencerId={selectedInfluencerId}
        />
        <BucketList
          title="Okish"
          bucket="OKISH"
          rows={okish}
          variant="secondary"
          onSave={() => handleBucketAction("OKISH", "save")}
          onDelete={() => handleBucketAction("OKISH", "delete")}
          onMoveEval={moveEval}
          actionLoading={bucketAction}
          onSelectInfluencer={setSelectedInfluencerId}
          selectedInfluencerId={selectedInfluencerId}
        />
        <BucketList
          title="Rejected"
          bucket="REJECTED"
          rows={rejected}
          variant="destructive"
          onSave={() => handleBucketAction("REJECTED", "save")}
          onDelete={() => handleBucketAction("REJECTED", "delete")}
          onMoveEval={moveEval}
          actionLoading={bucketAction}
          onSelectInfluencer={setSelectedInfluencerId}
          selectedInfluencerId={selectedInfluencerId}
        />
      </section>
    </div>

    {/* Detail Panel — shown when an influencer is selected */}
    {selectedInfluencerId && (() => {
      const allEvals = [...approved, ...okish, ...rejected, ...reviewQueue];
      const evalRow = allEvals.find((e) => e.influencer.id === selectedInfluencerId);
      if (!evalRow) return null;
      const inf = evalRow.influencer;
      return (
      <div className="w-[40%] min-w-[400px] border-l overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-2">
          <span className="text-sm font-semibold">Influencer Details</span>
          <button
            onClick={() => setSelectedInfluencerId(null)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Profile Header */}
          <div className="flex items-center gap-3">
            {inf.avatarUrl ? (
              <img src={`/api/thumbnail?url=${encodeURIComponent(inf.avatarUrl)}`} alt={inf.username} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-bold">{inf.username.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <p className="text-lg font-bold">{inf.displayName ?? inf.username}</p>
              <a
                href={`https://www.tiktok.com/@${inf.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                @{inf.username} ↗
              </a>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {inf.analytics?.influencerGender && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">{inf.analytics.influencerGender}</span>}
                {inf.analytics?.influencerAgeRange && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">{inf.analytics.influencerAgeRange}</span>}
                {inf.analytics?.influencerEthnicity && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">{inf.analytics.influencerEthnicity}</span>}
                {inf.analytics?.influencerCountry && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">{inf.analytics.influencerCountry}</span>}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">Followers</p>
              <p className="text-lg font-bold">{formatNumber(inf.followers)}</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">Engagement</p>
              <p className="text-lg font-bold">{inf.engagementRate != null ? `${inf.engagementRate}%` : "—"}</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-xs text-muted-foreground">AI Score</p>
              <p className="text-lg font-bold">{evalRow.score ?? "—"}</p>
            </div>
          </div>

          {/* AI Reasons */}
          {evalRow.reasons && (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">AI Reasoning</p>
              <p className="text-sm">{evalRow.reasons}</p>
            </div>
          )}
          {evalRow.matchedSignals && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Matched Signals</p>
              <p className="text-sm text-emerald-800">{evalRow.matchedSignals}</p>
            </div>
          )}
          {evalRow.riskSignals && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Risk Signals</p>
              <p className="text-sm text-red-800">{evalRow.riskSignals}</p>
            </div>
          )}

          {/* Videos */}
          {inf.videos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Videos ({inf.videos.length})</p>
              <div className="space-y-2">
                {inf.videos.slice(0, 6).map((video) => (
                  <a
                    key={video.id}
                    href={video.videoUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border p-2 hover:bg-muted/50 transition-colors"
                  >
                    {video.thumbnailUrl && (
                      <img src={`/api/thumbnail?url=${encodeURIComponent(video.thumbnailUrl)}`} alt="" className="h-12 w-10 rounded object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs line-clamp-2">{video.title ?? "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground">{formatNumber(video.views)} views</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Open full profile link */}
          <Link
            href={`/influencers?selected=${inf.id}`}
            className="block rounded-lg border p-3 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Open Full Profile →
          </Link>
        </div>
      </div>
      );
    })()}
    </div>
  );
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function BucketList({
  title,
  bucket,
  rows,
  variant,
  onSave,
  onDelete,
  onMoveEval,
  actionLoading,
  onSelectInfluencer,
  selectedInfluencerId,
}: {
  title: string;
  bucket: string;
  rows: Evaluation[];
  variant: "default" | "secondary" | "destructive";
  onSave: () => void;
  onDelete: () => void;
  onMoveEval: (evalId: string, targetBucket: string) => void;
  actionLoading: string | null;
  onSelectInfluencer?: (id: string) => void;
  selectedInfluencerId?: string | null;
}) {
  const allSaved =
    rows.length > 0 && rows.every((r) => r.reviewStatus === "SAVED");
  const hasSavable = rows.some((r) => r.reviewStatus !== "SAVED");

  // Other buckets to show as move targets
  const otherBuckets = (["APPROVED", "OKISH", "REJECTED"] as const).filter(
    (b) => b !== bucket,
  );

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{title}</p>
          <Badge variant={variant}>{rows.length}</Badge>
          {allSaved && (
            <Badge
              variant="outline"
              className="text-green-600 border-green-300"
            >
              Saved
            </Badge>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2">
            {hasSavable && (
              <Button
                size="sm"
                onClick={onSave}
                disabled={actionLoading !== null}
              >
                {actionLoading === `save-${bucket}` ? "Saving..." : "Save"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={actionLoading !== null}
              className="text-red-600"
            >
              {actionLoading === `delete-${bucket}` ? "Trashing..." : "Move to Trash"}
            </Button>
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          No influencers in this bucket.
        </p>
      ) : (
        <div className="space-y-2 p-3">
          {rows.map((row) => {
            const inf = row.influencer;
            const isSelected = selectedInfluencerId === inf.id;
            return (
            <div
              key={row.id}
              className={`group rounded-md border px-3 py-2 transition-colors cursor-pointer ${isSelected ? "bg-accent border-foreground/20" : "hover:bg-muted/40"}`}
              onClick={() => onSelectInfluencer?.(inf.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  {inf.avatarUrl ? (
                    <img
                      src={`/api/thumbnail?url=${encodeURIComponent(inf.avatarUrl)}`}
                      alt={inf.username}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-bold text-xs">
                      {inf.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">
                        {inf.displayName ?? inf.username}
                      </p>
                      {inf.analytics?.lastAnalyzedAt && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                          AI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      @{inf.username} · {formatNumber(inf.followers)} followers
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Move-to buttons — hidden by default, shown on hover */}
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {otherBuckets.map((target) => {
                      const colors = BUCKET_COLORS[target];
                      return (
                        <button
                          key={target}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onMoveEval(row.id, target); }}
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${colors.border} ${colors.text} ${colors.hover}`}
                          title={`Move to ${BUCKET_LABELS[target]}`}
                        >
                          → {BUCKET_LABELS[target]}
                        </button>
                      );
                    })}
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {row.score ?? "—"}
                  </span>
                </div>
              </div>
              {row.reasons && (
                <p className="mt-1 ml-12 text-xs text-muted-foreground line-clamp-2">
                  {row.reasons}
                </p>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
