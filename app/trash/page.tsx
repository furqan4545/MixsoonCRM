"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Trash2,
  RotateCcw,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { toast } from "sonner";
import { InfluencerDetailPanel } from "../influencers/influencer-detail-panel";

interface VideoRow {
  id: string;
  title: string | null;
  views: number | null;
  bookmarks: number | null;
  uploadedAt: string | null;
  thumbnailUrl: string | null;
  thumbnailProxied: string | null;
  videoUrl: string | null;
  tiktokId: string | null;
}

interface InfluencerRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarProxied: string | null;
  profileUrl: string | null;
  platform: string | null;
  followers: number | null;
  engagementRate: number | null;
  rate: number | null;
  language: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  biolink: string | null;
  bioLinkUrl: string | null;
  socialLinks: string | null;
  sourceFilename: string | null;
  importId: string | null;
  importFilename: string | null;
  pipelineStage: string;
  tags: string[];
  notes: string | null;
  aiScore: number | null;
  queueBucket: string | null;
  queueEvalId: string | null;
  aiReasons: string | null;
  aiMatchedSignals: string | null;
  aiRiskSignals: string | null;
  campaignName: string | null;
  videoCount: number;
  conversationCount: number;
  videos: VideoRow[];
  activityLogs: {
    id: string;
    type: string;
    title: string;
    detail: string | null;
    createdAt: string;
  }[];
  campaignAssignments: {
    campaignId: string;
    campaignName: string;
    campaignStatus: string;
  }[];
  analytics: {
    influencerGender: string | null;
    influencerAgeRange: string | null;
    influencerEthnicity: string | null;
    influencerCountry: string | null;
  } | null;
  pics: { id: string; name: string | null; email: string }[];
  createdAt: string;
}

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function getInitials(name: string | null, username: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2)
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return username.substring(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-amber-700 text-amber-50",
    "bg-emerald-700 text-emerald-50",
    "bg-sky-700 text-sky-50",
    "bg-violet-700 text-violet-50",
    "bg-rose-700 text-rose-50",
    "bg-teal-700 text-teal-50",
    "bg-orange-700 text-orange-50",
    "bg-indigo-700 text-indigo-50",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ inf }: { inf: InfluencerRow }) {
  if (inf.avatarProxied) {
    return (
      <ThumbnailImage
        src={inf.avatarProxied}
        alt={inf.username}
        className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
        fallbackText={getInitials(inf.displayName, inf.username)}
      />
    );
  }
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(inf.username)}`}
    >
      {getInitials(inf.displayName, inf.username)}
    </div>
  );
}

function AiScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const size = "h-9 w-9 text-xs";
  if (score >= 75) {
    return (
      <div className={`${size} flex items-center justify-center rounded-full border-2 border-emerald-500 text-emerald-700 font-bold`}>
        {score}
      </div>
    );
  }
  if (score >= 45) {
    return (
      <div className={`${size} flex items-center justify-center rounded-full border-2 border-amber-400 text-amber-700 font-bold`}>
        {score}
      </div>
    );
  }
  return (
    <div className={`${size} flex items-center justify-center rounded-full border-2 border-red-400 text-red-700 font-bold`}>
      {score}
    </div>
  );
}

function QueueBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return null;
  const config: Record<string, string> = {
    APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
    OKISH: "bg-amber-100 text-amber-800 border-amber-200",
    REJECTED: "bg-red-100 text-red-800 border-red-200",
  };
  const label: Record<string, string> = {
    APPROVED: "Approved",
    OKISH: "Ok-ish",
    REJECTED: "Rejected",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config[bucket] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
    >
      {label[bucket] ?? bucket}
    </span>
  );
}

export default function TrashPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [influencers, setInfluencers] = useState<InfluencerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected") ?? null,
  );
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);

  const fetchPage = useCallback(async (cursor?: string | null) => {
    const isFirst = !cursor;
    if (isFirst) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ limit: "50", trash: "true" });
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

  const filtered = useMemo(() => {
    if (!search.trim()) return influencers;
    const q = search.toLowerCase();
    return influencers.filter(
      (inf) =>
        inf.username.toLowerCase().includes(q) ||
        (inf.displayName?.toLowerCase().includes(q) ?? false) ||
        inf.tags.some((t) => t.toLowerCase().includes(q)) ||
        (inf.platform?.toLowerCase().includes(q) ?? false) ||
        (inf.email?.toLowerCase().includes(q) ?? false),
    );
  }, [influencers, search]);

  const selected = selectedId
    ? influencers.find((i) => i.id === selectedId) ?? null
    : null;

  const toggleRow = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selectedRows.size === filtered.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map((i) => i.id)));
    }
  }, [filtered, selectedRows.size]);

  const handleRestore = useCallback(async () => {
    setActing(true);
    try {
      const ids = [...selectedRows];
      const res = await fetch("/api/influencers/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, restore: true }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
      // Optimistic: remove restored from local state
      setInfluencers((prev) => prev.filter((inf) => !selectedRows.has(inf.id)));
      setTotalCount((prev) => prev - ids.length);
      setSelectedRows(new Set());
      setSelectedId(null);
    } catch {
      toast.error("Failed to restore");
    } finally {
      setActing(false);
    }
  }, [selectedRows]);

  const handleDeletePermanently = useCallback(async () => {
    if (!confirm(`Permanently delete ${selectedRows.size} influencer(s)? This cannot be undone.`)) return;
    setActing(true);
    try {
      const ids = [...selectedRows];
      const res = await fetch("/api/influencers/trash/permanent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
      // Optimistic: remove deleted from local state
      setInfluencers((prev) => prev.filter((inf) => !selectedRows.has(inf.id)));
      setTotalCount((prev) => prev - ids.length);
      setSelectedRows(new Set());
      setSelectedId(null);
    } catch {
      toast.error("Failed to delete permanently");
    } finally {
      setActing(false);
    }
  }, [selectedRows]);

  if (loading) {
    return <TrashLoadingSkeleton />;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Trash</h1>
              <p className="text-sm text-muted-foreground">
                {totalCount} trashed influencer{totalCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, handle, tag..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
            </div>
          </div>

          {/* Bulk actions bar */}
          {selectedRows.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border bg-accent/50 px-4 py-2">
              <span className="text-sm font-medium">
                {selectedRows.size} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={handleRestore}
                  className="gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore ({selectedRows.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acting}
                  onClick={handleDeletePermanently}
                  className="gap-1.5 text-xs text-red-700 border-red-700 hover:bg-red-50 font-semibold"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Permanently ({selectedRows.size})
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <Trash2 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">
                {search ? "No trashed influencers match your search." : "Trash is empty."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedRows.size === filtered.length}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Influencer
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Platform
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Followers
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Eng. Rate
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                      AI Score
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Queue
                    </th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inf) => {
                    const isChecked = selectedRows.has(inf.id);
                    return (
                      <tr
                        key={inf.id}
                        onClick={() => setSelectedId(inf.id)}
                        className={`border-b last:border-b-0 cursor-pointer transition-colors hover:bg-accent/50 ${
                          selectedId === inf.id
                            ? "bg-accent/70"
                            : isChecked
                              ? "bg-accent/30"
                              : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => toggleRow(inf.id, e)}
                            onChange={() => {}}
                            className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar inf={inf} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">
                                {inf.displayName ?? inf.username}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{inf.username}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {inf.platform ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          {formatNumber(inf.followers)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {inf.engagementRate != null ? `${inf.engagementRate}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <AiScoreBadge score={inf.aiScore} />
                        </td>
                        <td className="px-4 py-3">
                          <QueueBadge bucket={inf.queueBucket} />
                        </td>
                        <td className="px-2 py-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
      </div>

      {/* Detail Panel */}
      {selected && (
        <InfluencerDetailPanel
          influencer={selected}
          onClose={() => { setSelectedId(null); setPanelExpanded(false); }}
          expanded={panelExpanded}
          onToggleExpand={() => setPanelExpanded((v) => !v)}
        />
      )}
    </div>
  );
}

function TrashLoadingSkeleton() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="rounded-xl border bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
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
          </div>
        ))}
      </div>
    </div>
  );
}
