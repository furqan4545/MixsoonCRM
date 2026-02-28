"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Mail,
  Bell,
  Globe,
  Plus,
  X,
  Eye,
  Bookmark,
  Calendar,
  ExternalLink,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThumbnailImage } from "@/components/thumbnail-image";
import type { InfluencerRow } from "./influencers-dashboard";
import { toast } from "sonner";

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

const PIPELINE_STAGES = [
  { key: "PROSPECT", label: "Prospect" },
  { key: "OUTREACH", label: "Outreach" },
  { key: "NEGOTIATING", label: "Negotiating" },
  { key: "CONTRACTED", label: "Contracted" },
  { key: "COMPLETED", label: "Completed" },
] as const;

function getActivityDotColor(type: string): string {
  switch (type) {
    case "ai_score":
      return "bg-emerald-600";
    case "pipeline_change":
      return "bg-blue-600";
    case "email_extracted":
      return "bg-purple-600";
    case "tag_added":
      return "bg-amber-600";
    case "note_added":
      return "bg-teal-600";
    case "campaign_assigned":
      return "bg-rose-600";
    default:
      return "bg-gray-400";
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
}

interface Props {
  influencer: InfluencerRow;
  onClose: () => void;
}

export function InfluencerDetailPanel({ influencer, onClose }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(influencer.notes ?? "");
  const [tags, setTags] = useState<string[]>(influencer.tags);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.key === influencer.pipelineStage);

  const totalViews = influencer.videos.reduce((sum, v) => sum + (v.views ?? 0), 0);
  const totalBookmarks = influencer.videos.reduce((sum, v) => sum + (v.bookmarks ?? 0), 0);
  const avgViews = influencer.videos.length > 0 ? Math.round(totalViews / influencer.videos.length) : 0;

  const saveField = useCallback(
    async (field: string, value: unknown) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/influencers/${influencer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error("Failed to save");
        toast.success("Saved");
        router.refresh();
      } catch {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [influencer.id, router]
  );

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      const updated = [...tags, tag];
      setTags(updated);
      saveField("tags", updated);
    }
    setNewTag("");
    setShowTagInput(false);
  };

  const handleRemoveTag = (tag: string) => {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    saveField("tags", updated);
  };

  return (
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
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
          {influencer.email && (
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <a href={`/email/compose?to=${encodeURIComponent(influencer.email)}&influencerId=${influencer.id}`}>
                <Mail className="h-4 w-4" />
              </a>
            </Button>
          )}
          {influencer.profileUrl && (
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <a href={influencer.profileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Profile header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start gap-4">
          {/* Avatar — real pic from cloud/proxy, fallback to initials */}
          {influencer.avatarProxied ? (
            <ThumbnailImage
              src={influencer.avatarProxied}
              alt={influencer.username}
              className="h-16 w-16 shrink-0 rounded-full object-cover border-2 border-border"
              fallbackText={getInitials(influencer.displayName, influencer.username)}
            />
          ) : (
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${getAvatarColor(influencer.username)}`}
            >
              {getInitials(influencer.displayName, influencer.username)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold truncate">
                {influencer.displayName ?? influencer.username}
              </h2>
              {influencer.aiScore != null && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-600 bg-emerald-50 text-[10px] font-bold text-emerald-700">
                  {influencer.aiScore}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              @{influencer.username}
              {influencer.platform ? ` · ${influencer.platform}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                {PIPELINE_STAGES.find((s) => s.key === influencer.pipelineStage)?.label ?? "Prospect"}
              </Badge>
              {influencer.country && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="h-3 w-3" />
                  {influencer.country}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-4 divide-x rounded-lg border bg-background">
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Followers
            </p>
            <p className="mt-0.5 text-lg font-bold">{formatNumber(influencer.followers)}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Engagement
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {influencer.engagementRate != null ? `${influencer.engagementRate}%` : "—"}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rate
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {influencer.rate != null ? `$${influencer.rate.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Conversations
            </p>
            <p className="mt-0.5 text-lg font-bold">{influencer.conversationCount}</p>
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
            value="videos"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Videos ({influencer.videos.length})
          </TabsTrigger>
          <TabsTrigger
            value="conversations"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Conversations
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-0 pt-5 space-y-6 pb-8">
          {/* Contact Information */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Information
            </h3>
            <div className="space-y-0 rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="text-sm font-medium">{influencer.email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm text-muted-foreground">Platform</span>
                <span className="text-sm font-medium">{influencer.platform ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Country</span>
                <span className="text-sm font-medium">{influencer.country ?? "—"}</span>
              </div>
            </div>
          </section>

          {/* Tags */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tags
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                >
                  <span className="text-emerald-500">◇</span>
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 text-emerald-400 hover:text-emerald-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {showTagInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTag();
                      if (e.key === "Escape") {
                        setShowTagInput(false);
                        setNewTag("");
                      }
                    }}
                    autoFocus
                    placeholder="Tag name..."
                    className="h-7 w-24 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              )}
            </div>
          </section>

          {/* Campaign Assignments */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Campaigns
            </h3>
            {influencer.campaignAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not assigned to any campaigns.
              </p>
            ) : (
              <div className="space-y-2">
                {influencer.campaignAssignments.map((ca) => {
                  const statusColors: Record<string, string> = {
                    PLANNING: "bg-blue-100 text-blue-800 border-blue-200",
                    ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
                    PAUSED: "bg-amber-100 text-amber-800 border-amber-200",
                    COMPLETED: "bg-gray-100 text-gray-700 border-gray-200",
                  };
                  const statusLabels: Record<string, string> = {
                    PLANNING: "Planning",
                    ACTIVE: "Active",
                    PAUSED: "Paused",
                    COMPLETED: "Completed",
                  };
                  return (
                    <Link
                      key={ca.campaignId}
                      href={`/campaigns?selected=${ca.campaignId}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{ca.campaignName}</span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColors[ca.campaignStatus] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
                      >
                        {statusLabels[ca.campaignStatus] ?? ca.campaignStatus}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Pipeline Progress */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline Progress
            </h3>
            <div>
              <div className="flex gap-1 mb-2">
                {PIPELINE_STAGES.map((stage, i) => (
                  <div
                    key={stage.key}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= stageIndex ? "bg-foreground" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between">
                {PIPELINE_STAGES.map((stage, i) => (
                  <button
                    key={stage.key}
                    onClick={() => saveField("pipelineStage", stage.key)}
                    className={`text-[10px] transition-colors hover:text-foreground ${
                      i <= stageIndex
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

          {/* Video Stats Summary */}
          {influencer.videos.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Video Stats
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Videos</p>
                  <p className="mt-0.5 text-base font-bold">{influencer.videos.length}</p>
                </div>
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Views</p>
                  <p className="mt-0.5 text-base font-bold">{formatNumber(avgViews)}</p>
                </div>
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Saves</p>
                  <p className="mt-0.5 text-base font-bold">{formatNumber(totalBookmarks)}</p>
                </div>
              </div>
            </section>
          )}

          {/* Notes */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (influencer.notes ?? "")) {
                  saveField("notes", notes || null);
                }
              }}
              placeholder="Add internal notes..."
              rows={3}
              className="w-full rounded-lg bg-amber-50/80 border-amber-200/50 border p-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </section>

          {/* Activity Timeline */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity Timeline
            </h3>
            {influencer.activityLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-4">
                {influencer.activityLogs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${getActivityDotColor(log.type)}`} />
                      <div className="w-px flex-1 bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{log.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(log.createdAt)}
                        </span>
                      </div>
                      {log.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{log.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* Videos tab — restored from original detail page */}
        <TabsContent value="videos" className="mt-0 pt-5 pb-8">
          {influencer.videos.length === 0 ? (
            <div className="rounded-xl border bg-background px-6 py-12 text-center text-sm text-muted-foreground">
              No videos scraped for this influencer.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {influencer.videos.map((video) => (
                <div
                  key={video.id}
                  className="group overflow-hidden rounded-xl border bg-background transition-shadow hover:shadow-md"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-9/16 overflow-hidden bg-muted">
                    {video.thumbnailProxied ? (
                      <ThumbnailImage
                        src={video.thumbnailProxied}
                        alt={video.title ?? "Video thumbnail"}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No thumbnail
                      </div>
                    )}
                  </div>

                  {/* Video Info */}
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium leading-tight">
                      {video.title ?? "Untitled"}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {video.views != null && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Eye className="h-2.5 w-2.5" />
                          <span>{formatNumber(video.views)} views</span>
                        </div>
                      )}
                      {video.bookmarks != null && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Bookmark className="h-2.5 w-2.5" />
                          <span>{formatNumber(video.bookmarks)} saves</span>
                        </div>
                      )}
                      {video.uploadedAt && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>{new Date(video.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Conversations tab */}
        <TabsContent value="conversations" className="mt-0 pt-5 pb-8">
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              {influencer.conversationCount > 0
                ? `${influencer.conversationCount} conversation${influencer.conversationCount > 1 ? "s" : ""}`
                : "No conversations yet."}
            </p>
            {influencer.email && (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <a href={`/email/compose?to=${encodeURIComponent(influencer.email)}&influencerId=${influencer.id}`}>
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  Send Email
                </a>
              </Button>
            )}
          </div>
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes" className="mt-0 pt-5 pb-8">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (influencer.notes ?? "")) {
                saveField("notes", notes || null);
              }
            }}
            placeholder="Add internal notes about this influencer..."
            rows={10}
            className="w-full rounded-lg bg-amber-50/80 border-amber-200/50 border p-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
