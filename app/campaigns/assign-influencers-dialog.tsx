"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { toast } from "sonner";
import type { AssignableInfluencer } from "./campaigns-dashboard";

/* ───────────── helpers ───────────── */

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
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

/* ───────────── types ───────────── */

type QueueTab = "APPROVED" | "OKISH" | "ALL";

const QUEUE_TABS: { key: QueueTab; label: string; activeColor: string }[] = [
  {
    key: "APPROVED",
    label: "Approved",
    activeColor: "bg-emerald-600 text-white",
  },
  { key: "OKISH", label: "Ok-ish", activeColor: "bg-amber-500 text-white" },
  { key: "ALL", label: "All", activeColor: "bg-foreground text-background" },
];

/* ───────────── component ───────────── */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName: string;
  alreadyAssignedIds: Set<string>;
  approvedInfluencers: AssignableInfluencer[];
  okishInfluencers: AssignableInfluencer[];
}

export function AssignInfluencersDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  alreadyAssignedIds,
  approvedInfluencers,
  okishInfluencers,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [queueTab, setQueueTab] = useState<QueueTab>("APPROVED");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Merge lists for "ALL" tab (deduplicate by id)
  const allInfluencers = useMemo(() => {
    const map = new Map<string, AssignableInfluencer>();
    for (const inf of approvedInfluencers) map.set(inf.id, inf);
    for (const inf of okishInfluencers) map.set(inf.id, inf);
    return Array.from(map.values());
  }, [approvedInfluencers, okishInfluencers]);

  const sourceList =
    queueTab === "APPROVED"
      ? approvedInfluencers
      : queueTab === "OKISH"
        ? okishInfluencers
        : allInfluencers;

  const filtered = useMemo(() => {
    if (!search.trim()) return sourceList;
    const q = search.toLowerCase();
    return sourceList.filter(
      (inf) =>
        inf.username.toLowerCase().includes(q) ||
        (inf.displayName?.toLowerCase().includes(q) ?? false) ||
        (inf.email?.toLowerCase().includes(q) ?? false),
    );
  }, [sourceList, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const newSelections = useMemo(
    () => Array.from(selected).filter((id) => !alreadyAssignedIds.has(id)),
    [selected, alreadyAssignedIds],
  );

  const handleAssign = async () => {
    if (newSelections.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketing-campaigns/${campaignId}/influencers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ influencerIds: newSelections }),
        },
      );
      if (!res.ok) throw new Error("Failed to assign");
      toast.success(`Assigned ${newSelections.length} influencer${newSelections.length > 1 ? "s" : ""}`);
      setSelected(new Set());
      setSearch("");
      router.refresh();
      onOpenChange(false);
    } catch {
      toast.error("Failed to assign influencers");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Influencers to {campaignName}
          </DialogTitle>
        </DialogHeader>

        {/* Search + Queue tabs */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, handle, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {QUEUE_TABS.map((tab) => {
              const active = queueTab === tab.key;
              const count =
                tab.key === "APPROVED"
                  ? approvedInfluencers.length
                  : tab.key === "OKISH"
                    ? okishInfluencers.length
                    : allInfluencers.length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setQueueTab(tab.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
        </div>

        {/* Influencer list */}
        <div className="max-h-[400px] overflow-y-auto rounded-lg border">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No influencers found.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((inf) => {
                const isAssigned = alreadyAssignedIds.has(inf.id);
                const isChecked = selected.has(inf.id) || isAssigned;
                return (
                  <label
                    key={inf.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer ${
                      isAssigned
                        ? "opacity-50 cursor-not-allowed bg-muted/30"
                        : isChecked
                          ? "bg-accent/50"
                          : "hover:bg-accent/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isAssigned}
                      onChange={() => !isAssigned && toggleSelect(inf.id)}
                      className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                    />
                    {/* Avatar */}
                    {inf.avatarProxied ? (
                      <ThumbnailImage
                        src={inf.avatarProxied}
                        alt={inf.username}
                        className="h-8 w-8 shrink-0 rounded-full object-cover border border-border"
                        fallbackText={getInitials(inf.displayName, inf.username)}
                      />
                    ) : (
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${getAvatarColor(inf.username)}`}
                      >
                        {getInitials(inf.displayName, inf.username)}
                      </div>
                    )}
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {inf.displayName ?? inf.username}
                        </p>
                        {isAssigned && (
                          <span className="text-[10px] text-muted-foreground italic">
                            (assigned)
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        @{inf.username}
                      </p>
                    </div>
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatNumber(inf.followers)} followers</span>
                      <span>{inf.platform ?? "—"}</span>
                      {inf.engagementRate != null && (
                        <span>{inf.engagementRate}%</span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={loading || newSelections.length === 0}
            className="gap-1.5"
          >
            {loading
              ? "Assigning..."
              : `Assign ${newSelections.length} Influencer${newSelections.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
