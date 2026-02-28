"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Calendar,
  DollarSign,
  Users,
  UserPlus,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThumbnailImage } from "@/components/thumbnail-image";
import { toast } from "sonner";
import Link from "next/link";
import type {
  CampaignRow,
  CampaignInfluencerRow,
  AssignableInfluencer,
} from "./campaigns-dashboard";
import { StatusBadge } from "./campaigns-dashboard";
import { CampaignDialog } from "./campaign-dialog";
import { AssignInfluencersDialog } from "./assign-influencers-dialog";

/* ───────────── helpers ───────────── */

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

/* ───────────── status stages ───────────── */

const STATUS_STAGES = [
  { key: "PLANNING", label: "Planning", color: "bg-blue-600" },
  { key: "ACTIVE", label: "Active", color: "bg-emerald-600" },
  { key: "PAUSED", label: "Paused", color: "bg-amber-500" },
  { key: "COMPLETED", label: "Completed", color: "bg-gray-500" },
] as const;

/* ───────────── component ───────────── */

interface Props {
  campaign: CampaignRow;
  approvedInfluencers: AssignableInfluencer[];
  okishInfluencers: AssignableInfluencer[];
  onClose: () => void;
}

export function CampaignDetailPanel({
  campaign,
  approvedInfluencers,
  okishInfluencers,
  onClose,
}: Props) {
  const router = useRouter();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const statusIndex = STATUS_STAGES.findIndex(
    (s) => s.key === campaign.status,
  );

  const alreadyAssignedIds = useMemo(
    () => new Set(campaign.influencers.map((inf) => inf.id)),
    [campaign.influencers],
  );

  const updateStatus = useCallback(
    async (newStatus: string) => {
      try {
        const res = await fetch(`/api/marketing-campaigns/${campaign.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error("Failed");
        toast.success(`Status changed to ${newStatus}`);
        router.refresh();
      } catch {
        toast.error("Failed to update status");
      }
    },
    [campaign.id, router],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`))
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/marketing-campaigns/${campaign.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Campaign deleted");
      onClose();
      router.refresh();
    } catch {
      toast.error("Failed to delete campaign");
    } finally {
      setDeleting(false);
    }
  }, [campaign.id, campaign.name, onClose, router]);

  const removeInfluencer = useCallback(
    async (influencerId: string) => {
      setRemovingId(influencerId);
      try {
        const res = await fetch(
          `/api/marketing-campaigns/${campaign.id}/influencers`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ influencerIds: [influencerId] }),
          },
        );
        if (!res.ok) throw new Error("Failed");
        toast.success("Influencer removed");
        router.refresh();
      } catch {
        toast.error("Failed to remove influencer");
      } finally {
        setRemovingId(null);
      }
    },
    [campaign.id, router],
  );

  return (
    <>
      <div className="w-[480px] shrink-0 border-l bg-card overflow-y-auto h-full">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowEditDialog(true)}
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Campaign header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold truncate">{campaign.name}</h2>
                <StatusBadge status={campaign.status} />
              </div>
              {campaign.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-3">
                  {campaign.description}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-4 divide-x rounded-lg border bg-background">
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Budget
              </p>
              <p className="mt-0.5 text-lg font-bold">
                {campaign.budget != null
                  ? `$${campaign.budget.toLocaleString()}`
                  : "—"}
              </p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Influencers
              </p>
              <p className="mt-0.5 text-lg font-bold">
                {campaign.influencerCount}
              </p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Start
              </p>
              <p className="mt-0.5 text-sm font-bold">
                {formatDate(campaign.startDate)}
              </p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                End
              </p>
              <p className="mt-0.5 text-sm font-bold">
                {formatDate(campaign.endDate)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="px-6">
          <TabsList className="w-full justify-start border-b bg-transparent p-0 h-auto rounded-none">
            <TabsTrigger
              value="overview"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="influencers"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Influencers ({campaign.influencerCount})
            </TabsTrigger>
          </TabsList>

          {/* Overview tab */}
          <TabsContent value="overview" className="mt-0 pt-5 space-y-6 pb-8">
            {/* Campaign Details */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign Details
              </h3>
              <div className="space-y-0 rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <span className="text-sm font-medium">{campaign.name}</span>
                </div>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-muted-foreground">Budget</span>
                  <span className="text-sm font-medium">
                    {campaign.budget != null
                      ? `$${campaign.budget.toLocaleString()}`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    Start Date
                  </span>
                  <span className="text-sm font-medium">
                    {formatDate(campaign.startDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    End Date
                  </span>
                  <span className="text-sm font-medium">
                    {formatDate(campaign.endDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">
                    {formatDate(campaign.createdAt)}
                  </span>
                </div>
              </div>
            </section>

            {/* Status Progress */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign Status
              </h3>
              <div>
                <div className="flex gap-1 mb-2">
                  {STATUS_STAGES.map((stage, i) => (
                    <div
                      key={stage.key}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= statusIndex ? stage.color : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between">
                  {STATUS_STAGES.map((stage, i) => (
                    <button
                      key={stage.key}
                      onClick={() => updateStatus(stage.key)}
                      className={`text-[10px] transition-colors hover:text-foreground ${
                        i <= statusIndex
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Description */}
            {campaign.description && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Description
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {campaign.description}
                </p>
              </section>
            )}
          </TabsContent>

          {/* Influencers tab */}
          <TabsContent value="influencers" className="mt-0 pt-5 pb-8">
            <div className="mb-4">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setShowAssignDialog(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Influencers
              </Button>
            </div>

            {campaign.influencers.length === 0 ? (
              <div className="rounded-xl border bg-background px-6 py-12 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No influencers assigned yet.
                </p>
                <button
                  onClick={() => setShowAssignDialog(true)}
                  className="mt-2 text-sm text-primary underline hover:no-underline"
                >
                  Add approved influencers
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {campaign.influencers.map((inf) => (
                  <div
                    key={inf.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-accent/30 transition-colors group"
                  >
                    {/* Avatar */}
                    {inf.avatarProxied ? (
                      <ThumbnailImage
                        src={inf.avatarProxied}
                        alt={inf.username}
                        className="h-9 w-9 shrink-0 rounded-full object-cover border border-border"
                        fallbackText={getInitials(
                          inf.displayName,
                          inf.username,
                        )}
                      />
                    ) : (
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(inf.username)}`}
                      >
                        {getInitials(inf.displayName, inf.username)}
                      </div>
                    )}
                    {/* Info */}
                    <Link
                      href={`/influencers?selected=${inf.id}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="truncate text-sm font-medium">
                        {inf.displayName ?? inf.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{inf.username} · {inf.platform ?? "—"} ·{" "}
                        {formatNumber(inf.followers)} followers
                      </p>
                    </Link>
                    {/* Assigned date + remove */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(inf.assignedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <button
                        onClick={() => removeInfluencer(inf.id)}
                        disabled={removingId === inf.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                        title="Remove from campaign"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <CampaignDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSuccess={() => {
          setShowEditDialog(false);
          router.refresh();
        }}
        campaign={campaign}
      />

      {/* Assign Dialog */}
      <AssignInfluencersDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        campaignId={campaign.id}
        campaignName={campaign.name}
        alreadyAssignedIds={alreadyAssignedIds}
        approvedInfluencers={approvedInfluencers}
        okishInfluencers={okishInfluencers}
      />
    </>
  );
}
