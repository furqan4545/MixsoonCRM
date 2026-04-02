"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  ExternalLink,
  X,
  Loader2,
  AlertTriangle,
  Settings,
  Flame,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── TYPES ────────────────────────────────────────────────

interface Snapshot {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  recordedAt: string;
}

interface TrackedVideoRow {
  id: string;
  videoUrl: string;
  tiktokId: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  currentViews: number;
  currentLikes: number;
  currentComments: number;
  currentSaves: number;
  currentShares: number;
  isTracking: boolean;
  lastTrackedAt: string | null;
  createdAt: string;
  influencer: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  campaign: { id: string; name: string } | null;
  snapshots: Snapshot[];
  _count: { viralAlerts: number };
}

interface ViralAlertRow {
  id: string;
  metric: string;
  threshold: number;
  valueAtAlert: number;
  status: string;
  createdAt: string;
  trackedVideo: { id: string; videoUrl: string; title: string | null; currentViews: number };
  influencer: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
}

interface Influencer {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarProxied?: string | null;
}

interface Campaign {
  id: string;
  name: string;
}

// ─── HELPERS ──────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function Sparkline({ data, color = "#16a34a" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── COMPONENT ────────────────────────────────────────────

export function TrackingDashboard() {
  const [videos, setVideos] = useState<TrackedVideoRow[]>([]);
  const [viralAlerts, setViralAlerts] = useState<ViralAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addUrls, setAddUrls] = useState("");
  const [addInfluencerId, setAddInfluencerId] = useState("");
  const [addCampaignId, setAddCampaignId] = useState("");
  const [adding, setAdding] = useState(false);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [infSearch, setInfSearch] = useState("");

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(TrackedVideoRow & { viralAlerts: ViralAlertRow[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Config dialog
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({ viewsThreshold: 100000, likesThreshold: 10000, commentsThreshold: 5000, savesThreshold: 5000, sharesThreshold: 5000, enabled: true });

  // Prevent double-fetching
  const fetchingRef = useRef(false);

  const fetchVideos = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [videosRes, alertsRes] = await Promise.all([
        fetch("/api/tracked-videos"),
        fetch("/api/viral-alerts?status=ACTIVE"),
      ]);
      if (videosRes.ok) setVideos(await videosRes.json());
      if (alertsRes.ok) setViralAlerts(await alertsRes.json());
    } catch {
      toast.error("Failed to load tracking data");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Fetch detail when selected
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    fetch(`/api/tracked-videos/${selectedId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Fetch influencers/campaigns for add dialog
  useEffect(() => {
    if (showAddDialog) {
      fetch("/api/influencers?limit=2000&minimal=true")
        .then((r) => r.json())
        .then((d) => setInfluencers(d.influencers || []))
        .catch(() => {});
      fetch("/api/marketing-campaigns")
        .then((r) => r.json())
        .then((d) => setCampaigns(d || []))
        .catch(() => {});
    }
  }, [showAddDialog]);

  const filtered = useMemo(() => {
    if (!search) return videos;
    const q = search.toLowerCase();
    return videos.filter(
      (v) =>
        v.title?.toLowerCase().includes(q) ||
        v.videoUrl.toLowerCase().includes(q) ||
        v.influencer.username.toLowerCase().includes(q) ||
        (v.influencer.displayName || "").toLowerCase().includes(q),
    );
  }, [videos, search]);

  // Refresh single video
  const refreshVideo = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await fetch(`/api/tracked-videos/${id}/refresh`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Stats refreshed");
      await fetchVideos();
      if (selectedId === id) {
        const d = await fetch(`/api/tracked-videos/${id}`).then((r) => r.json());
        setDetail(d);
      }
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshingId(null);
    }
  };

  // Refresh all
  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const res = await fetch("/api/tracked-videos/bulk-refresh", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Refreshed ${data.refreshed} videos${data.viralAlerts > 0 ? `, ${data.viralAlerts} viral alerts!` : ""}`);
      await fetchVideos();
    } catch {
      toast.error("Bulk refresh failed");
    } finally {
      setRefreshingAll(false);
    }
  };

  // Add videos
  const handleAdd = async () => {
    if (!addUrls.trim() || !addInfluencerId) return;
    setAdding(true);
    const urls = addUrls.split("\n").map((u) => u.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/tracked-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls: urls, influencerId: addInfluencerId, campaignId: addCampaignId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to add");
        return;
      }
      const data = await res.json();
      toast.success(`${data.created} video(s) added — fetching stats...`);
      setShowAddDialog(false);
      setAddUrls("");
      setAddInfluencerId("");
      setAddCampaignId("");
      // Auto-refresh immediately to get initial stats
      await fetch("/api/tracked-videos/bulk-refresh", { method: "POST" });
      await fetchVideos();
    } catch {
      toast.error("Failed to add videos");
    } finally {
      setAdding(false);
    }
  };

  // Toggle tracking
  const toggleTracking = async (id: string, isTracking: boolean) => {
    await fetch(`/api/tracked-videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isTracking: !isTracking }),
    });
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, isTracking: !isTracking } : v));
    toast.success(isTracking ? "Tracking paused" : "Tracking resumed");
  };

  // Delete
  const deleteVideo = async (id: string) => {
    if (!confirm("Stop tracking and remove this video?")) return;
    await fetch(`/api/tracked-videos/${id}`, { method: "DELETE" });
    setVideos((prev) => prev.filter((v) => v.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success("Video removed from tracking");
  };

  // Dismiss viral alert
  const dismissAlert = async (id: string) => {
    await fetch(`/api/viral-alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    setViralAlerts((prev) => prev.filter((a) => a.id !== id));
    toast.success("Alert dismissed");
  };

  // Filtered influencers for add dialog
  const filteredInfluencers = useMemo(() => {
    if (!infSearch) return influencers.slice(0, 50);
    const q = infSearch.toLowerCase();
    return influencers.filter((i) => i.username.toLowerCase().includes(q) || (i.displayName || "").toLowerCase().includes(q)).slice(0, 50);
  }, [influencers, infSearch]);

  const totalViews = videos.reduce((s, v) => s + v.currentViews, 0);
  const totalActive = videos.filter((v) => v.isTracking).length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex h-full">
        {/* Main content */}
        <div className={`flex-1 p-6 space-y-6 overflow-auto ${selectedId ? "max-w-[60%]" : ""}`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Performance Tracking</h1>
              <p className="text-sm text-muted-foreground">
                {videos.length} video{videos.length !== 1 ? "s" : ""} · {totalActive} active · {fmtNum(totalViews)} total views
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
                <Settings className="h-4 w-4 mr-1" />
                Thresholds
              </Button>
              <Button variant="outline" onClick={refreshAll} disabled={refreshingAll || videos.length === 0}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshingAll ? "animate-spin" : ""}`} />
                {refreshingAll ? "Refreshing..." : "Refresh All"}
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Track Video
              </Button>
            </div>
          </div>

          {/* Viral Alerts Banner */}
          {viralAlerts.length > 0 && (
            <div className="space-y-2">
              {viralAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Flame className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-orange-900">
                        @{alert.influencer.username}&apos;s video hit {fmtNum(alert.valueAtAlert)} {alert.metric}!
                      </p>
                      <p className="text-xs text-orange-700">
                        Threshold: {fmtNum(alert.threshold)} · {new Date(alert.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedId(alert.trackedVideo.id)}
                    >
                      View
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => dismissAlert(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
              {viralAlerts.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{viralAlerts.length - 3} more alerts
                </p>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, URL, influencer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Video List */}
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No tracked videos</p>
              <p className="text-xs text-muted-foreground mt-1">Add TikTok URLs to start tracking performance</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((v) => (
                <div
                  key={v.id}
                  className={`border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition ${selectedId === v.id ? "border-primary bg-muted/20" : ""} ${!v.isTracking ? "opacity-60" : ""}`}
                  onClick={() => setSelectedId(v.id)}
                >
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    {v.thumbnailUrl ? (
                      <img src={v.thumbnailUrl} alt="" className="h-16 w-12 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-16 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{v.title || "Untitled"}</p>
                        {v._count.viralAlerts > 0 && (
                          <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        )}
                        {!v.isTracking && (
                          <Badge variant="secondary" className="text-[10px]">Paused</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        @{v.influencer.username}
                        {v.campaign ? ` · ${v.campaign.name}` : ""}
                      </p>

                      {/* Stats row */}
                      <div className="flex items-center gap-4 mt-1.5">
                        <span className="flex items-center gap-1 text-xs">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          {fmtNum(v.currentViews)}
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <Heart className="h-3 w-3 text-muted-foreground" />
                          {fmtNum(v.currentLikes)}
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <MessageCircle className="h-3 w-3 text-muted-foreground" />
                          {fmtNum(v.currentComments)}
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <Bookmark className="h-3 w-3 text-muted-foreground" />
                          {fmtNum(v.currentSaves)}
                        </span>
                      </div>
                    </div>

                    {/* Sparkline */}
                    <div className="shrink-0">
                      <Sparkline
                        data={[...v.snapshots].reverse().map((s) => s.views)}
                        color={v.currentViews > 100000 ? "#f97316" : "#16a34a"}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => refreshVideo(v.id)}
                        disabled={refreshingId === v.id}
                        title="Refresh stats"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshingId === v.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleTracking(v.id, v.isTracking)}
                        title={v.isTracking ? "Pause tracking" : "Resume tracking"}
                      >
                        {v.isTracking ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedId && (
          <div className="w-[40%] border-l bg-background overflow-y-auto">
            <div className="p-6 space-y-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !detail ? (
                <p className="text-sm text-muted-foreground">Video not found</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold truncate pr-4">{detail.title || "Untitled"}</h2>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <a href={detail.videoUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteVideo(detail.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Influencer */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    @{detail.influencer.username}
                    {detail.campaign && <Badge variant="outline" className="text-[10px]">{detail.campaign.name}</Badge>}
                  </div>

                  {/* Stats cards */}
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { icon: Eye, label: "Views", value: detail.currentViews, color: "text-blue-600" },
                      { icon: Heart, label: "Likes", value: detail.currentLikes, color: "text-red-500" },
                      { icon: MessageCircle, label: "Comments", value: detail.currentComments, color: "text-green-600" },
                      { icon: Bookmark, label: "Saves", value: detail.currentSaves, color: "text-amber-600" },
                      { icon: Share2, label: "Shares", value: detail.currentShares, color: "text-purple-600" },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center p-2 bg-muted/50 rounded-lg">
                        <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                        <p className="text-sm font-bold">{fmtNum(stat.value)}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Chart — views over time */}
                  {detail.snapshots.length > 1 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3">Views Over Time</h3>
                      <div className="h-40 flex items-end gap-px">
                        {(() => {
                          const snaps = detail.snapshots;
                          const maxViews = Math.max(...snaps.map((s) => s.views), 1);
                          return snaps.map((s, i) => {
                            const height = (s.views / maxViews) * 100;
                            return (
                              <div
                                key={i}
                                className="flex-1 group relative"
                                title={`${new Date(s.recordedAt).toLocaleDateString()}: ${fmtNum(s.views)} views`}
                              >
                                <div
                                  className="w-full bg-primary/70 rounded-t-sm hover:bg-primary transition min-h-[2px]"
                                  style={{ height: `${Math.max(height, 2)}%` }}
                                />
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                        <span>{new Date(detail.snapshots[0].recordedAt).toLocaleDateString()}</span>
                        <span>{new Date(detail.snapshots[detail.snapshots.length - 1].recordedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}

                  {/* Engagement chart */}
                  {detail.snapshots.length > 1 && (
                    <div>
                      <h3 className="text-sm font-medium mb-3">Engagement Over Time</h3>
                      <div className="h-32 flex items-end gap-px">
                        {(() => {
                          const snaps = detail.snapshots;
                          const maxEng = Math.max(...snaps.map((s) => s.likes + s.comments + s.saves), 1);
                          return snaps.map((s, i) => {
                            const total = s.likes + s.comments + s.saves;
                            const h = (total / maxEng) * 100;
                            const likePct = total > 0 ? (s.likes / total) * h : 0;
                            const commentPct = total > 0 ? (s.comments / total) * h : 0;
                            const savePct = total > 0 ? (s.saves / total) * h : 0;
                            return (
                              <div
                                key={i}
                                className="flex-1 flex flex-col-reverse"
                                title={`${new Date(s.recordedAt).toLocaleDateString()}: ${fmtNum(s.likes)} likes, ${fmtNum(s.comments)} comments, ${fmtNum(s.saves)} saves`}
                              >
                                <div className="w-full bg-red-400 rounded-b-sm" style={{ height: `${Math.max(likePct, 0.5)}%` }} />
                                <div className="w-full bg-green-400" style={{ height: `${commentPct}%` }} />
                                <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: `${savePct}%` }} />
                              </div>
                            );
                          });
                        })()}
                      </div>
                      <div className="flex gap-4 mt-2 text-[10px]">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Likes</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" /> Comments</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Saves</span>
                      </div>
                    </div>
                  )}

                  {/* Viral alerts for this video */}
                  {detail.viralAlerts && detail.viralAlerts.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Viral Alerts</h3>
                      {detail.viralAlerts.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 p-2 bg-orange-50 rounded text-xs mb-1">
                          <Flame className="h-3 w-3 text-orange-500" />
                          <span className="font-medium">{fmtNum(a.valueAtAlert)} {a.metric}</span>
                          <span className="text-muted-foreground">
                            (threshold: {fmtNum(a.threshold)}) · {new Date(a.createdAt).toLocaleDateString()}
                          </span>
                          <Badge variant={a.status === "ACTIVE" ? "default" : "secondary"} className="text-[9px] ml-auto">
                            {a.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Added: {new Date(detail.createdAt).toLocaleDateString()}</p>
                    {detail.lastTrackedAt && <p>Last refreshed: {new Date(detail.lastTrackedAt).toLocaleString()}</p>}
                    <p>Status: {detail.isTracking ? "Tracking" : "Paused"}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Video Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) { setAddUrls(""); setAddInfluencerId(""); setAddCampaignId(""); setInfSearch(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Track TikTok Video(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>TikTok Video URL(s) — one per line</Label>
              <Textarea
                value={addUrls}
                onChange={(e) => {
                  const val = e.target.value;
                  setAddUrls(val);
                  // Auto-detect influencer from URL
                  const lines = val.split("\n").map((l) => l.trim()).filter(Boolean);
                  const usernames = new Set<string>();
                  for (const line of lines) {
                    const match = line.match(/@([^/]+)/);
                    if (match) usernames.add(match[1].toLowerCase());
                  }
                  if (usernames.size === 1) {
                    const username = [...usernames][0];
                    const found = influencers.find((i) => i.username.toLowerCase() === username);
                    if (found) {
                      setAddInfluencerId(found.id);
                    } else {
                      setAddInfluencerId("");
                    }
                  }
                }}
                placeholder={"https://www.tiktok.com/@username/video/1234567890"}
                rows={3}
              />
            </div>

            {/* Auto-detected or manual influencer */}
            {(() => {
              const sel = influencers.find((i) => i.id === addInfluencerId);
              if (sel) {
                return (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      {(sel.avatarProxied || sel.avatarUrl) ? (
                        <img src={sel.avatarProxied || sel.avatarUrl || ""} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                          {(sel.displayName || sel.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-green-900">{sel.displayName || sel.username}</p>
                        <p className="text-[11px] text-green-700">@{sel.username} — auto-detected from URL</p>
                      </div>
                    </div>
                    <button onClick={() => setAddInfluencerId("")} className="text-green-700 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              }
              // Extract username from URL to show what we're looking for
              const lines = addUrls.split("\n").map((l) => l.trim()).filter(Boolean);
              const usernames = new Set<string>();
              for (const line of lines) {
                const match = line.match(/@([^/]+)/);
                if (match) usernames.add(match[1]);
              }
              if (usernames.size > 0 && !addInfluencerId) {
                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                      @{[...usernames].join(", @")} not found in your influencers. Select manually:
                    </p>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search influencer..."
                        value={infSearch}
                        onChange={(e) => setInfSearch(e.target.value)}
                        className="pl-9 text-sm"
                      />
                    </div>
                    <div className="mt-1 border rounded-lg max-h-32 overflow-y-auto bg-white">
                      {filteredInfluencers.map((inf) => (
                        <button
                          key={inf.id}
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                          onClick={() => setAddInfluencerId(inf.id)}
                        >
                          <span className="font-medium truncate">{inf.displayName || inf.username}</span>
                          <span className="text-[11px] text-muted-foreground">@{inf.username}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div>
              <Label>Campaign (optional)</Label>
              <Select value={addCampaignId || "none"} onValueChange={(v) => setAddCampaignId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!addUrls.trim() || !addInfluencerId || adding}>
              {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding...</> : "Add & Start Tracking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viral Threshold Config Dialog */}
      <Dialog open={showConfig} onOpenChange={(open) => {
        if (open) {
          fetch("/api/viral-alerts/config").then((r) => r.json()).then(setConfig).catch(() => {});
        }
        setShowConfig(open);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Viral Alert Thresholds</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set minimum values to trigger a viral alert.</p>
            {[
              { key: "viewsThreshold", label: "Views", icon: Eye },
              { key: "likesThreshold", label: "Likes", icon: Heart },
              { key: "commentsThreshold", label: "Comments", icon: MessageCircle },
              { key: "savesThreshold", label: "Saves", icon: Bookmark },
              { key: "sharesThreshold", label: "Shares", icon: Share2 },
            ].map(({ key, label, icon: Icon }) => (
              <div key={key} className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="w-20 shrink-0">{label}</Label>
                <Input
                  type="number"
                  value={config[key as keyof typeof config] as number}
                  onChange={(e) => setConfig({ ...config, [key]: parseInt(e.target.value) || 0 })}
                  className="flex-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>Cancel</Button>
            <Button onClick={async () => {
              await fetch("/api/viral-alerts/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
              });
              toast.success("Thresholds saved");
              setShowConfig(false);
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
