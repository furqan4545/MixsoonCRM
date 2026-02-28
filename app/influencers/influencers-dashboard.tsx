"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  Trash2,
  ArrowRightLeft,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { toast } from "sonner";
import Link from "next/link";
import { InfluencerDetailPanel } from "./influencer-detail-panel";

export interface VideoRow {
  id: string;
  title: string | null;
  views: number | null;
  bookmarks: number | null;
  uploadedAt: string | null;
  thumbnailUrl: string | null;
  thumbnailProxied: string | null;
}

export interface InfluencerRow {
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
  // Queue data
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

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  PROSPECT: { label: "Prospect", color: "text-muted-foreground" },
  OUTREACH: { label: "Outreach", color: "text-orange-600" },
  NEGOTIATING: { label: "Negotiating", color: "text-red-600" },
  CONTRACTED: { label: "Contracted", color: "text-emerald-600" },
  COMPLETED: { label: "Completed", color: "text-emerald-700" },
};

type QueueFilter = "ALL" | "APPROVED" | "OKISH" | "REJECTED" | "UNSCORED";

const QUEUE_TABS: {
  key: QueueFilter;
  label: string;
  color: string;
  activeColor: string;
}[] = [
  {
    key: "ALL",
    label: "All",
    color: "text-muted-foreground",
    activeColor: "bg-foreground text-background",
  },
  {
    key: "APPROVED",
    label: "Approved",
    color: "text-emerald-700",
    activeColor: "bg-emerald-600 text-white",
  },
  {
    key: "OKISH",
    label: "Ok-ish",
    color: "text-amber-700",
    activeColor: "bg-amber-500 text-white",
  },
  {
    key: "REJECTED",
    label: "Rejected",
    color: "text-red-700",
    activeColor: "bg-red-600 text-white",
  },
  {
    key: "UNSCORED",
    label: "Unscored",
    color: "text-muted-foreground",
    activeColor: "bg-gray-500 text-white",
  },
];

function AiScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  let ringColor = "border-gray-300 text-gray-500";
  if (score >= 90)
    ringColor = "border-emerald-600 text-emerald-700 bg-emerald-50";
  else if (score >= 80)
    ringColor = "border-emerald-500 text-emerald-600 bg-emerald-50/50";
  else if (score >= 70)
    ringColor = "border-amber-500 text-amber-600 bg-amber-50/50";
  else ringColor = "border-gray-400 text-gray-500 bg-gray-50";

  return (
    <div
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold ${ringColor}`}
    >
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

/** Avatar: shows real profile pic if available, falls back to initials */
function Avatar({
  inf,
  size = "sm",
}: {
  inf: InfluencerRow;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-16 w-16 text-xl" : "h-9 w-9 text-xs";

  if (inf.avatarProxied) {
    return (
      <ThumbnailImage
        src={inf.avatarProxied}
        alt={inf.username}
        className={`${dim} shrink-0 rounded-full object-cover border border-border`}
        fallbackText={getInitials(inf.displayName, inf.username)}
      />
    );
  }

  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-bold ${getAvatarColor(inf.username)}`}
    >
      {getInitials(inf.displayName, inf.username)}
    </div>
  );
}

interface Props {
  influencers: InfluencerRow[];
}

export function InfluencersDashboard({ influencers }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected") ?? null,
  );
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("ALL");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  // Count per queue
  const queueCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: influencers.length,
      APPROVED: 0,
      OKISH: 0,
      REJECTED: 0,
      UNSCORED: 0,
    };
    for (const inf of influencers) {
      if (inf.queueBucket === "APPROVED") counts.APPROVED++;
      else if (inf.queueBucket === "OKISH") counts.OKISH++;
      else if (inf.queueBucket === "REJECTED") counts.REJECTED++;
      else counts.UNSCORED++;
    }
    return counts;
  }, [influencers]);

  const filtered = useMemo(() => {
    let list = influencers;

    // Queue filter
    if (queueFilter !== "ALL") {
      if (queueFilter === "UNSCORED") {
        list = list.filter((inf) => !inf.queueBucket);
      } else {
        list = list.filter((inf) => inf.queueBucket === queueFilter);
      }
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (inf) =>
          inf.username.toLowerCase().includes(q) ||
          (inf.displayName?.toLowerCase().includes(q) ?? false) ||
          inf.tags.some((t) => t.toLowerCase().includes(q)) ||
          (inf.platform?.toLowerCase().includes(q) ?? false) ||
          (inf.email?.toLowerCase().includes(q) ?? false),
      );
    }

    return list;
  }, [influencers, search, queueFilter]);

  const selected = selectedId
    ? influencers.find((i) => i.id === selectedId) ?? null
    : null;

  // Toggle row selection
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

  // Remove from queue (set reviewStatus to DISCARDED)
  const removeFromQueue = useCallback(
    async (evalIds: string[]) => {
      try {
        const promises = evalIds.map((id) =>
          fetch(`/api/ai/queues/${id}`, { method: "DELETE" }),
        );
        await Promise.all(promises);
        toast.success(`Removed ${evalIds.length} from queue`);
        setSelectedRows(new Set());
        router.refresh();
      } catch {
        toast.error("Failed to remove from queue");
      }
    },
    [router],
  );

  // Move between queues
  const moveToQueue = useCallback(
    async (evalIds: string[], targetBucket: string) => {
      setMoving(true);
      try {
        const res = await fetch("/api/influencers/move-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evalIds, targetBucket }),
        });
        if (!res.ok) throw new Error("Failed");
        toast.success(`Moved ${evalIds.length} to ${targetBucket}`);
        setSelectedRows(new Set());
        router.refresh();
      } catch {
        toast.error("Failed to move");
      } finally {
        setMoving(false);
      }
    },
    [router],
  );

  // Get eval IDs for selected rows
  const selectedEvalIds = useMemo(() => {
    return filtered
      .filter((inf) => selectedRows.has(inf.id) && inf.queueEvalId)
      .map((inf) => inf.queueEvalId!);
  }, [filtered, selectedRows]);

  // Get IDs of selected influencers that have no queue bucket (unscored)
  const selectedUnscoredIds = useMemo(() => {
    return filtered
      .filter((inf) => selectedRows.has(inf.id) && !inf.queueBucket)
      .map((inf) => inf.id);
  }, [filtered, selectedRows]);

  // Campaigns for the AI filter dropdown
  const [campaigns, setCampaigns] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    if (campaigns) return; // already loaded
    setLoadingCampaigns(true);
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) setCampaigns(await res.json());
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoadingCampaigns(false);
    }
  }, [campaigns]);

  const runAiFilter = useCallback(
    async (campaignId: string) => {
      setMoving(true);
      try {
        const res = await fetch("/api/ai/filter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, influencerIds: selectedUnscoredIds }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        const { runId, totalCount } = await res.json();
        toast.success(
          `AI Filter started for ${totalCount} influencer${totalCount !== 1 ? "s" : ""}`,
        );
        setSelectedRows(new Set());
        router.push(`/ai-filter/${runId}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to start AI filter",
        );
      } finally {
        setMoving(false);
      }
    },
    [selectedUnscoredIds, router],
  );

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Influencers
              </h1>
              <p className="text-sm text-muted-foreground">
                {influencers.length} influencer
                {influencers.length !== 1 ? "s" : ""} in your database
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
              <Button variant="outline" size="default" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </Button>
              <Button asChild className="gap-2">
                <Link href="/data-scraper">
                  <Plus className="h-4 w-4" />
                  Import CSV
                </Link>
              </Button>
            </div>
          </div>

          {/* Queue filter tabs */}
          <div className="mb-4 flex items-center gap-1.5">
            {QUEUE_TABS.map((tab) => {
              const active = queueFilter === tab.key;
              const count = queueCounts[tab.key] ?? 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setQueueFilter(tab.key);
                    setSelectedRows(new Set());
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? tab.activeColor
                      : `bg-background border hover:bg-accent ${tab.color}`
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-muted"}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bulk actions bar */}
          {selectedRows.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border bg-accent/50 px-4 py-2">
              <span className="text-sm font-medium">
                {selectedRows.size} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                {/* Move to queue buttons — visible when scored influencers are selected */}
                {selectedEvalIds.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={moving}
                      onClick={() => moveToQueue(selectedEvalIds, "APPROVED")}
                      className="gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Move to Approved
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={moving}
                      onClick={() => moveToQueue(selectedEvalIds, "OKISH")}
                      className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Move to Ok-ish
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={moving}
                      onClick={() => moveToQueue(selectedEvalIds, "REJECTED")}
                      className="gap-1.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      Move to Rejected
                    </Button>
                  </>
                )}
                {/* Run AI Filter — shown when unscored influencers are selected */}
                {selectedUnscoredIds.length >= 1 && (
                  <DropdownMenu onOpenChange={(open) => open && fetchCampaigns()}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={moving}
                        className="gap-1.5 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        Run AI Filter ({selectedUnscoredIds.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {loadingCampaigns && (
                        <DropdownMenuItem disabled>Loading campaigns…</DropdownMenuItem>
                      )}
                      {campaigns && campaigns.length === 0 && (
                        <DropdownMenuItem disabled>No campaigns found</DropdownMenuItem>
                      )}
                      {campaigns?.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() => runAiFilter(c.id)}
                        >
                          {c.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {selectedEvalIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFromQueue(selectedEvalIds)}
                    className="gap-1.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove from Queue
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRows(new Set())}
                  className="text-xs"
                >
                  Deselect
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <p className="text-muted-foreground">
                {search
                  ? "No influencers match your search."
                  : queueFilter !== "ALL"
                    ? `No influencers in the ${QUEUE_TABS.find((t) => t.key === queueFilter)?.label ?? ""} queue.`
                    : "No influencers yet."}
              </p>
              {!search && queueFilter === "ALL" && (
                <Link
                  href="/data-scraper"
                  className="mt-2 inline-block text-sm text-primary underline hover:no-underline"
                >
                  Upload a CSV to get started
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          filtered.length > 0 &&
                          selectedRows.size === filtered.length
                        }
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
                    {queueFilter === "ALL" && (
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Queue
                      </th>
                    )}
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Stage
                    </th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inf) => {
                    const stage =
                      STAGE_CONFIG[inf.pipelineStage] ?? STAGE_CONFIG.PROSPECT;
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
                            <Avatar inf={inf} size="sm" />
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
                          {inf.engagementRate != null
                            ? `${inf.engagementRate}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <AiScoreBadge score={inf.aiScore} />
                        </td>
                        {queueFilter === "ALL" && (
                          <td className="px-4 py-3">
                            <QueueBadge bucket={inf.queueBucket} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-medium ${stage.color}`}
                          >
                            {stage.label}
                          </span>
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
      </div>

      {/* Detail Panel */}
      {selected && (
        <InfluencerDetailPanel
          influencer={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
