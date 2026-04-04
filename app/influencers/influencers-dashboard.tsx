"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ChevronRight,
  ChevronDown,
  Trash2,
  ArrowRightLeft,
  Sparkles,
  Check,
  BarChart3,
  UserPlus,
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
  videoUrl: string | null;
  tiktokId: string | null;
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
  analytics: {
    influencerGender: string | null;
    influencerAgeRange: string | null;
    influencerEthnicity: string | null;
    influencerCountry: string | null;
  } | null;
  pics: { id: string; name: string | null; email: string }[];
  savedAt: string | null;
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

type QueueFilter = "ALL" | "APPROVED" | "OKISH" | "REJECTED" | "UNSCORED" | "SAVED";

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
  {
    key: "SAVED",
    label: "Saved",
    color: "text-amber-600",
    activeColor: "bg-amber-500 text-white",
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

const STAGE_OPTIONS = [
  { key: "PROSPECT", label: "Prospect", badgeColor: "bg-gray-100 text-gray-700 border-gray-200" },
  { key: "OUTREACH", label: "Outreach", badgeColor: "bg-orange-100 text-orange-700 border-orange-200" },
  { key: "NEGOTIATING", label: "Negotiating", badgeColor: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "CONTRACTED", label: "Contracted", badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "COMPLETED", label: "Completed", badgeColor: "bg-blue-100 text-blue-700 border-blue-200" },
] as const;

function StageCell({
  influencerId,
  currentStage,
  onUpdated,
}: {
  influencerId: string;
  currentStage: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = STAGE_OPTIONS.find((s) => s.key === currentStage) ?? STAGE_OPTIONS[0];

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 144 }); // 144 = menu w-36
    }
    setOpen(!open);
  };

  const handleSelect = async (stageKey: string) => {
    setOpen(false);
    if (stageKey === currentStage) return;
    try {
      const res = await fetch(`/api/influencers/${influencerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStage: stageKey }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Stage updated");
      onUpdated();
    } catch {
      toast.error("Failed to update stage");
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors hover:opacity-80 ${current.badgeColor}`}
      >
        {current.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-36 rounded-lg border bg-card shadow-lg py-1"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {STAGE_OPTIONS.map((stage) => (
            <button
              key={stage.key}
              onClick={() => handleSelect(stage.key)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stage.badgeColor}`}
              >
                {stage.label}
              </span>
              {stage.key === currentStage && (
                <Check className="ml-auto h-3 w-3 text-emerald-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </>
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
  onRefresh?: () => void;
}

export function InfluencersDashboard({ influencers, onRefresh }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected") ?? null,
  );
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("ALL");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const bulkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterCountry, setFilterCountry] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterMinFollowers, setFilterMinFollowers] = useState("");
  const [filterMaxFollowers, setFilterMaxFollowers] = useState("");
  const activeFilterCount = [filterCountry, filterLanguage, filterPlatform, filterMinFollowers, filterMaxFollowers].filter(Boolean).length;

  // Count per queue
  const queueCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: influencers.length,
      APPROVED: 0,
      OKISH: 0,
      REJECTED: 0,
      UNSCORED: 0,
      SAVED: 0,
    };
    for (const inf of influencers) {
      if (inf.savedAt) counts.SAVED++;
      if (inf.queueBucket === "APPROVED") counts.APPROVED++;
      else if (inf.queueBucket === "OKISH") counts.OKISH++;
      else if (inf.queueBucket === "REJECTED") counts.REJECTED++;
      else counts.UNSCORED++;
    }
    return counts;
  }, [influencers]);

  // Unique filter options
  const filterOptions = useMemo(() => {
    const countries = new Set<string>();
    const languages = new Set<string>();
    const platforms = new Set<string>();
    for (const inf of influencers) {
      if (inf.country) countries.add(inf.country);
      if (inf.language) languages.add(inf.language);
      if (inf.platform) platforms.add(inf.platform);
    }
    return {
      countries: [...countries].sort(),
      languages: [...languages].sort(),
      platforms: [...platforms].sort(),
    };
  }, [influencers]);

  const filtered = useMemo(() => {
    let list = influencers;

    // Queue filter
    if (queueFilter !== "ALL") {
      if (queueFilter === "SAVED") {
        list = list.filter((inf) => !!inf.savedAt);
      } else if (queueFilter === "UNSCORED") {
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

    // Advanced filters
    if (filterCountry) {
      list = list.filter((inf) => inf.country === filterCountry);
    }
    if (filterLanguage) {
      list = list.filter((inf) => inf.language === filterLanguage);
    }
    if (filterPlatform) {
      list = list.filter((inf) => inf.platform === filterPlatform);
    }
    if (filterMinFollowers) {
      const min = parseInt(filterMinFollowers, 10);
      if (!isNaN(min)) list = list.filter((inf) => (inf.followers ?? 0) >= min);
    }
    if (filterMaxFollowers) {
      const max = parseInt(filterMaxFollowers, 10);
      if (!isNaN(max)) list = list.filter((inf) => (inf.followers ?? 0) <= max);
    }

    return list;
  }, [influencers, search, queueFilter, filterCountry, filterLanguage, filterPlatform, filterMinFollowers, filterMaxFollowers]);

  // Cache loaded influencer details — cleared on any data mutation
  const detailCacheRef = useRef<Map<string, InfluencerRow>>(new Map());
  const [detailData, setDetailData] = useState<InfluencerRow | null>(null);

  const clearDetailCache = useCallback(() => {
    detailCacheRef.current.clear();
    setDetailData(null);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      return;
    }
    // Serve from cache if available
    const cached = detailCacheRef.current.get(selectedId);
    if (cached) {
      setDetailData(cached);
      return;
    }
    // Otherwise fetch and cache
    let cancelled = false;
    fetch(`/api/influencers/${selectedId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data) {
          detailCacheRef.current.set(selectedId, data);
          setDetailData(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId]);

  const selected = selectedId
    ? (detailData?.id === selectedId ? detailData : null) ?? influencers.find((i) => i.id === selectedId) ?? null
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
        clearDetailCache();
        router.refresh();
      } catch {
        toast.error("Failed to remove from queue");
      }
    },
    [router, clearDetailCache],
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
        clearDetailCache();
        router.refresh();
      } catch {
        toast.error("Failed to move");
      } finally {
        setMoving(false);
      }
    },
    [router, clearDetailCache],
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

  // Select by Import
  const [imports, setImports] = useState<
    { id: string; sourceFilename: string; rowCount: number }[] | null
  >(null);
  const [loadingImports, setLoadingImports] = useState(false);

  const fetchImports = useCallback(async () => {
    if (imports) return;
    setLoadingImports(true);
    try {
      const res = await fetch("/api/imports");
      if (res.ok) {
        const data = await res.json();
        setImports(data.filter?.((i: { status: string }) => i.status === "COMPLETED") ?? data);
      }
    } catch {
      toast.error("Failed to load imports");
    } finally {
      setLoadingImports(false);
    }
  }, [imports]);

  const selectByImport = useCallback(
    async (importId: string) => {
      try {
        const res = await fetch(`/api/influencers?importId=${importId}&limit=2000&minimal=true`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const ids = (data.influencers ?? []).map((i: { id: string }) => i.id);
        setSelectedRows(new Set(ids));
        toast.info(`Selected ${ids.length} influencers from import`);
      } catch {
        toast.error("Failed to load influencers for this import");
      }
    },
    [],
  );

  // PIC assignment
  const [picUsers, setPicUsers] = useState<{ id: string; name: string | null; email: string; role: string }[] | null>(null);
  const [loadingPicUsers, setLoadingPicUsers] = useState(false);

  const fetchPicUsers = useCallback(async () => {
    if (picUsers) return;
    setLoadingPicUsers(true);
    try {
      const res = await fetch("/api/users");
      if (res.ok) setPicUsers(await res.json());
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoadingPicUsers(false);
    }
  }, [picUsers]);

  const assignPic = useCallback(
    async (userId: string) => {
      setMoving(true);
      try {
        const res = await fetch("/api/influencers/pics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ influencerIds: [...selectedRows], userIds: [userId] }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        toast.success(data.message);
        setSelectedRows(new Set());
        clearDetailCache();
        onRefresh?.();
      } catch {
        toast.error("Failed to assign PIC");
      } finally {
        setMoving(false);
      }
    },
    [selectedRows, onRefresh],
  );

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
        // Trigger progress indicator
        localStorage.setItem("mixsoon_active_ai_run", runId);
        window.dispatchEvent(
          new CustomEvent("ai-filter-started", { detail: runId }),
        );
        toast.info("AI filter started", {
          description: `Scoring ${totalCount} influencer${totalCount !== 1 ? "s" : ""} in background.`,
        });
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

  const runBulkAnalysis = useCallback(
    async (mode: "NLP_ONLY" | "HYBRID" | "FULL_VISION") => {
      setBulkAnalyzing(true);
      try {
        const ids = [...selectedRows];
        const res = await fetch("/api/analytics/bulk-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ influencerIds: ids, mode }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed");
        }
        const { batchId, total, skipped } = await res.json();
        if (total === 0) {
          toast.info("All selected influencers already have analysis running");
          setBulkAnalyzing(false);
          return;
        }

        const toastId = toast.loading(`Analyzing ${total} influencers...`, {
          description: `Starting... ${skipped > 0 ? `(${skipped} skipped — already running)` : ""}`,
          duration: Infinity,
        });

        // Poll for progress
        bulkPollRef.current = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/analytics/bulk-status/${batchId}`);
            if (!statusRes.ok) return;
            const status = await statusRes.json();

            toast.loading(
              `Analyzing ${total} influencers... (${status.completed}/${total} done)`,
              {
                id: toastId,
                description: status.current
                  ? `Currently: @${status.current.username} — ${status.current.progressMsg ?? status.current.status}`
                  : status.failed > 0
                    ? `${status.completed} completed, ${status.failed} failed`
                    : `${status.completed} completed`,
              },
            );

            if (status.done) {
              if (bulkPollRef.current) clearInterval(bulkPollRef.current);
              bulkPollRef.current = null;
              setBulkAnalyzing(false);
              setSelectedRows(new Set());
              window.dispatchEvent(new CustomEvent("analysis-complete"));

              if (status.failed > 0) {
                toast.warning(`Bulk analysis finished: ${status.completed} completed, ${status.failed} failed`, { id: toastId, duration: 5000 });
              } else {
                toast.success(`All ${status.completed} influencers analyzed!`, { id: toastId, duration: 5000 });
              }
            }
          } catch {
            // Ignore poll errors
          }
        }, 3000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start bulk analysis");
        setBulkAnalyzing(false);
      }
    },
    [selectedRows, router],
  );

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (bulkPollRef.current) clearInterval(bulkPollRef.current);
    };
  }, []);

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
              <Button
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="default"
                className="gap-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <Button asChild className="gap-2">
                <Link href="/data-scraper">
                  <Plus className="h-4 w-4" />
                  Import CSV
                </Link>
              </Button>
            </div>
          </div>

          {/* Advanced filter panel */}
          {showFilters && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px]">
                  <label className="text-xs font-semibold text-muted-foreground">Country</label>
                  <select
                    value={filterCountry}
                    onChange={(e) => setFilterCountry(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All countries</option>
                    {filterOptions.countries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="text-xs font-semibold text-muted-foreground">Language</label>
                  <select
                    value={filterLanguage}
                    onChange={(e) => setFilterLanguage(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All languages</option>
                    {filterOptions.languages.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[140px]">
                  <label className="text-xs font-semibold text-muted-foreground">Platform</label>
                  <select
                    value={filterPlatform}
                    onChange={(e) => setFilterPlatform(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="">All platforms</option>
                    {filterOptions.platforms.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="text-xs font-semibold text-muted-foreground">Min Followers</label>
                  <Input
                    type="number"
                    placeholder="e.g. 10000"
                    value={filterMinFollowers}
                    onChange={(e) => setFilterMinFollowers(e.target.value)}
                    className="mt-1 h-9"
                    min={0}
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="text-xs font-semibold text-muted-foreground">Max Followers</label>
                  <Input
                    type="number"
                    placeholder="e.g. 1000000"
                    value={filterMaxFollowers}
                    onChange={(e) => setFilterMaxFollowers(e.target.value)}
                    className="mt-1 h-9"
                    min={0}
                  />
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs text-muted-foreground"
                    onClick={() => {
                      setFilterCountry("");
                      setFilterLanguage("");
                      setFilterPlatform("");
                      setFilterMinFollowers("");
                      setFilterMaxFollowers("");
                    }}
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </div>
          )}

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
                {/* Assign PIC */}
                <DropdownMenu onOpenChange={(open) => open && fetchPicUsers()}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={moving}
                      className="gap-1.5 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                    >
                      <UserPlus className="h-3 w-3" />
                      Assign PIC ({selectedRows.size})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                    {loadingPicUsers && <DropdownMenuItem disabled>Loading users...</DropdownMenuItem>}
                    {picUsers && picUsers.length === 0 && <DropdownMenuItem disabled>No users found</DropdownMenuItem>}
                    {picUsers?.map((u) => (
                      <DropdownMenuItem key={u.id} onClick={() => assignPic(u.id)}>
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">
                            {(u.name ?? u.email).charAt(0).toUpperCase()}
                          </div>
                          <span>{u.name ?? u.email}</span>
                          <span className="text-[10px] text-muted-foreground">{u.role}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Move to Trash */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={moving}
                  onClick={async () => {
                    setMoving(true);
                    try {
                      const res = await fetch("/api/influencers/trash", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: [...selectedRows] }),
                      });
                      if (!res.ok) throw new Error();
                      const data = await res.json();
                      toast.success(data.message);
                      setSelectedRows(new Set());
                      clearDetailCache();
                      onRefresh?.();
                    } catch {
                      toast.error("Failed to trash influencers");
                    } finally {
                      setMoving(false);
                    }
                  }}
                  className="gap-1.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Move to Trash ({selectedRows.size})
                </Button>
                {/* Bulk Audience Analysis */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bulkAnalyzing}
                      className="gap-1.5 text-xs text-purple-700 border-purple-300 hover:bg-purple-50"
                    >
                      <BarChart3 className="h-3 w-3" />
                      {bulkAnalyzing ? "Analyzing..." : `Analyze Audience (${selectedRows.size})`}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => runBulkAnalysis("HYBRID")}>
                      Hybrid (Recommended)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => runBulkAnalysis("NLP_ONLY")}>
                      NLP Only (Fastest)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => runBulkAnalysis("FULL_VISION")}>
                      Full Vision (Most Detailed)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Select by Import */}
                <DropdownMenu onOpenChange={(open) => open && fetchImports()}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs text-muted-foreground"
                    >
                      Select by Import
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                    {loadingImports && (
                      <DropdownMenuItem disabled>Loading imports…</DropdownMenuItem>
                    )}
                    {imports && imports.length === 0 && (
                      <DropdownMenuItem disabled>No imports found</DropdownMenuItem>
                    )}
                    {imports?.map((imp) => (
                      <DropdownMenuItem
                        key={imp.id}
                        onClick={() => selectByImport(imp.id)}
                      >
                        {imp.sourceFilename} ({imp.rowCount})
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Last Posted
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      PIC
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
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold">
                                  {inf.displayName ?? inf.username}
                                </p>
                                {inf.analytics?.lastAnalyzedAt && (
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
                                    title={`Analyzed ${new Date(inf.analytics.lastAnalyzedAt).toLocaleDateString()} · ${inf.analytics.mode ?? "HYBRID"} · ${Math.round((inf.analytics.confidence ?? 0) * 100)}% confidence`}
                                  >
                                    <BarChart3 className="h-2.5 w-2.5" />
                                    AI
                                  </span>
                                )}
                              </div>
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
                        <td className="px-4 py-3 text-sm">
                          {(() => {
                            const lastVideo = inf.videos[0];
                            if (!lastVideo?.uploadedAt) return <span className="text-muted-foreground">—</span>;
                            const days = Math.floor((Date.now() - new Date(lastVideo.uploadedAt).getTime()) / 86400000);
                            return (
                              <span className={`${days > 30 ? "text-red-600 font-medium" : days > 14 ? "text-amber-600" : "text-muted-foreground"}`}>
                                {days === 0 ? "Today" : days === 1 ? "1d ago" : `${days}d ago`}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {inf.pics.length > 0 ? (
                            <div className="flex -space-x-1.5">
                              {inf.pics.slice(0, 3).map((pic) => (
                                <div
                                  key={pic.id}
                                  title={pic.name ?? pic.email}
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white ring-2 ring-card"
                                >
                                  {(pic.name ?? pic.email).charAt(0).toUpperCase()}
                                </div>
                              ))}
                              {inf.pics.length > 3 && (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-bold ring-2 ring-card">
                                  +{inf.pics.length - 3}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        {queueFilter === "ALL" && (
                          <td className="px-4 py-3">
                            <QueueBadge bucket={inf.queueBucket} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <StageCell
                            influencerId={inf.id}
                            currentStage={inf.pipelineStage}
                            onUpdated={() => { clearDetailCache(); router.refresh(); }}
                          />
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
          onClose={() => { setSelectedId(null); setPanelExpanded(false); }}
          expanded={panelExpanded}
          onToggleExpand={() => setPanelExpanded((v) => !v)}
        />
      )}
    </div>
  );
}
