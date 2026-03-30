"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Plus,
  ChevronRight,
  Calendar,
  DollarSign,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { CampaignDetailPanel } from "./campaign-detail-panel";
import { CampaignDialog } from "./campaign-dialog";

/* ───────────── types ───────────── */

export interface AssignableInfluencer {
  id: string;
  username: string;
  displayName: string | null;
  avatarProxied: string | null;
  followers: number | null;
  platform: string | null;
  email: string | null;
  engagementRate: number | null;
}

export interface CampaignInfluencerRow {
  id: string;
  username: string;
  displayName: string | null;
  avatarProxied: string | null;
  followers: number | null;
  platform: string | null;
  email: string | null;
  engagementRate: number | null;
  pipelineStage: string;
  assignedAt: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  influencerCount: number;
  isMyCampaign?: boolean;
  influencers: CampaignInfluencerRow[];
  createdAt: string;
}

/* ───────────── helpers ───────────── */

function formatCurrency(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getInitials(name: string | null, username: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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

/* ───────────── status config ───────────── */

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  PLANNING: {
    label: "Planning",
    color: "text-blue-800",
    bgColor: "bg-blue-100 border-blue-200",
  },
  ACTIVE: {
    label: "Active",
    color: "text-emerald-800",
    bgColor: "bg-emerald-100 border-emerald-200",
  },
  PAUSED: {
    label: "Paused",
    color: "text-amber-800",
    bgColor: "bg-amber-100 border-amber-200",
  },
  COMPLETED: {
    label: "Completed",
    color: "text-gray-700",
    bgColor: "bg-gray-100 border-gray-200",
  },
};

type StatusFilter = "ALL" | "PLANNING" | "ACTIVE" | "PAUSED" | "COMPLETED";

const STATUS_TABS: {
  key: StatusFilter;
  label: string;
  activeColor: string;
}[] = [
  { key: "ALL", label: "All", activeColor: "bg-foreground text-background" },
  {
    key: "PLANNING",
    label: "Planning",
    activeColor: "bg-blue-600 text-white",
  },
  {
    key: "ACTIVE",
    label: "Active",
    activeColor: "bg-emerald-600 text-white",
  },
  { key: "PAUSED", label: "Paused", activeColor: "bg-amber-500 text-white" },
  {
    key: "COMPLETED",
    label: "Completed",
    activeColor: "bg-gray-500 text-white",
  },
];

/* ───────────── status badge ───────────── */

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PLANNING;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bgColor} ${config.color}`}
    >
      {config.label}
    </span>
  );
}

/* ───────────── avatar stack ───────────── */

function AvatarStack({
  influencers,
  total,
}: {
  influencers: CampaignInfluencerRow[];
  total: number;
}) {
  const show = influencers.slice(0, 4);
  const extra = total - show.length;

  if (total === 0) {
    return <span className="text-xs text-muted-foreground">None</span>;
  }

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {show.map((inf) =>
          inf.avatarProxied ? (
            <ThumbnailImage
              key={inf.id}
              src={inf.avatarProxied}
              alt={inf.username}
              className="h-7 w-7 rounded-full object-cover border-2 border-card"
              fallbackText={getInitials(inf.displayName, inf.username)}
            />
          ) : (
            <div
              key={inf.id}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-card text-[9px] font-bold ${getAvatarColor(inf.username)}`}
            >
              {getInitials(inf.displayName, inf.username)}
            </div>
          ),
        )}
      </div>
      {extra > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ───────────── main component ───────────── */

type OwnershipFilter = "MY" | "ALL_CAMPAIGNS";

interface Props {
  campaigns: CampaignRow[];
  approvedInfluencers: AssignableInfluencer[];
  okishInfluencers: AssignableInfluencer[];
  isAdmin?: boolean;
}

export function CampaignsDashboard({
  campaigns,
  approvedInfluencers,
  okishInfluencers,
  isAdmin = false,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected") ?? null,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("MY");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const myCampaigns = useMemo(
    () => campaigns.filter((c) => c.isMyCampaign),
    [campaigns],
  );

  // Which list to use based on ownership filter (admins always see all)
  const baseCampaigns = isAdmin
    ? campaigns
    : ownershipFilter === "MY"
      ? myCampaigns
      : campaigns;

  // Count per status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: baseCampaigns.length,
      PLANNING: 0,
      ACTIVE: 0,
      PAUSED: 0,
      COMPLETED: 0,
    };
    for (const c of baseCampaigns) {
      if (counts[c.status] !== undefined) counts[c.status]++;
    }
    return counts;
  }, [baseCampaigns]);

  const filtered = useMemo(() => {
    let list = baseCampaigns;

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((c) => c.status === statusFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false),
      );
    }

    return list;
  }, [baseCampaigns, search, statusFilter]);

  const selected = selectedId
    ? campaigns.find((c) => c.id === selectedId) ?? null
    : null;

  const handleCreated = useCallback(() => {
    setShowCreateDialog(false);
    router.refresh();
  }, [router]);

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Marketing Campaigns
              </h1>
              <p className="text-sm text-muted-foreground">
                {baseCampaigns.length} campaign{baseCampaigns.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search campaigns..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-56 pl-9"
                />
              </div>
              <Button
                className="gap-2"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4" />
                New Campaign
              </Button>
            </div>
          </div>

          {/* Ownership toggle (PIC only) */}
          {!isAdmin && (
            <div className="mb-3 flex items-center gap-1 rounded-lg bg-muted p-1">
              <button
                onClick={() => setOwnershipFilter("MY")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  ownershipFilter === "MY"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                My Campaigns ({myCampaigns.length})
              </button>
              <button
                onClick={() => setOwnershipFilter("ALL_CAMPAIGNS")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  ownershipFilter === "ALL_CAMPAIGNS"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Campaigns ({campaigns.length})
              </button>
            </div>
          )}

          {/* Status filter tabs */}
          <div className="mb-4 flex items-center gap-1.5">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              const count = statusCounts[tab.key] ?? 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? tab.activeColor
                      : "bg-background border hover:bg-accent text-muted-foreground"
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

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card px-6 py-12 text-center">
              <p className="text-muted-foreground">
                {search
                  ? "No campaigns match your search."
                  : statusFilter !== "ALL"
                    ? `No ${STATUS_CONFIG[statusFilter]?.label ?? ""} campaigns.`
                    : "No campaigns yet."}
              </p>
              {!search && statusFilter === "ALL" && (
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-2 inline-block text-sm text-primary underline hover:no-underline"
                >
                  Create your first campaign
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Budget
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Dates
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Influencers
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Created
                    </th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`border-b last:border-b-0 cursor-pointer transition-colors hover:bg-accent/50 ${
                        selectedId === c.id ? "bg-accent/70" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {c.name}
                          </p>
                          {c.description && (
                            <p className="truncate text-xs text-muted-foreground max-w-[240px]">
                              {c.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-muted-foreground" />
                          {c.budget != null
                            ? c.budget.toLocaleString()
                            : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {c.startDate || c.endDate ? (
                            <span>
                              {formatDateShort(c.startDate)} –{" "}
                              {formatDateShort(c.endDate)}
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AvatarStack
                            influencers={c.influencers}
                            total={c.influencerCount}
                          />
                          <span className="text-xs text-muted-foreground">
                            {c.influencerCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <CampaignDetailPanel
          campaign={selected}
          approvedInfluencers={approvedInfluencers}
          okishInfluencers={okishInfluencers}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Create Dialog */}
      <CampaignDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreated}
      />
    </div>
  );
}
