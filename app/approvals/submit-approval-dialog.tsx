"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Globe,
  Users,
  TrendingUp,
  MapPin,
  ExternalLink,
  Search,
  X,
} from "lucide-react";

type InfluencerOption = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarProxied: string | null;
  email: string | null;
  followers: number | null;
  platform: string | null;
  country: string | null;
  engagementRate: number | null;
  profileUrl: string | null;
};

type CampaignOption = {
  id: string;
  name: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-fill for re-submit after counter-offer */
  prefill?: {
    influencerId?: string;
    rate?: number;
    currency?: string;
    deliverables?: string;
    notes?: string;
    campaignId?: string;
  } | null;
}

function formatFollowers(n: number | null) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function SubmitApprovalDialog({
  open,
  onOpenChange,
  onSuccess,
  prefill,
}: Props) {
  const [influencers, setInfluencers] = useState<InfluencerOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [influencerId, setInfluencerId] = useState(
    prefill?.influencerId ?? "",
  );
  const [rate, setRate] = useState(prefill?.rate?.toString() ?? "");
  const [currency, setCurrency] = useState(prefill?.currency ?? "USD");
  const [deliverables, setDeliverables] = useState(
    prefill?.deliverables ?? "",
  );
  const [campaignId, setCampaignId] = useState(prefill?.campaignId ?? "");

  // New pricing fields
  const [videosPerBundle, setVideosPerBundle] = useState("");
  const [ratePerVideo, setRatePerVideo] = useState("");
  const [totalPriceLocal, setTotalPriceLocal] = useState("");
  const [totalPriceUsd, setTotalPriceUsd] = useState("");
  const [profileLink, setProfileLink] = useState("");
  const [picNotes, setPicNotes] = useState(prefill?.notes ?? "");

  const [loading, setLoading] = useState(false);

  // Searchable influencer dropdown state
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Selected influencer details
  const selectedInfluencer = useMemo(
    () => influencers.find((i) => i.id === influencerId) ?? null,
    [influencers, influencerId],
  );

  // Filtered influencer list for search
  const filteredInfluencers = useMemo(() => {
    if (!searchQuery.trim()) return influencers;
    const q = searchQuery.toLowerCase();
    return influencers.filter(
      (inf) =>
        inf.username.toLowerCase().includes(q) ||
        (inf.displayName && inf.displayName.toLowerCase().includes(q)) ||
        (inf.email && inf.email.toLowerCase().includes(q)) ||
        (inf.country && inf.country.toLowerCase().includes(q)) ||
        (inf.platform && inf.platform.toLowerCase().includes(q)),
    );
  }, [influencers, searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset form when dialog opens or prefill changes
  useEffect(() => {
    if (open) {
      setInfluencerId(prefill?.influencerId ?? "");
      setRate(prefill?.rate?.toString() ?? "");
      setCurrency(prefill?.currency ?? "USD");
      setDeliverables(prefill?.deliverables ?? "");
      setCampaignId(prefill?.campaignId ?? "");
      setVideosPerBundle("");
      setRatePerVideo("");
      setTotalPriceLocal("");
      setTotalPriceUsd("");
      setProfileLink("");
      setPicNotes(prefill?.notes ?? "");
      setSearchQuery("");
      setShowDropdown(false);
    }
  }, [open, prefill]);

  // Auto-fill profile link when influencer selected
  useEffect(() => {
    if (selectedInfluencer && !profileLink) {
      if (selectedInfluencer.profileUrl) {
        setProfileLink(selectedInfluencer.profileUrl);
      } else {
        const handle = selectedInfluencer.username.startsWith(".")
          ? selectedInfluencer.username.slice(1)
          : selectedInfluencer.username;
        setProfileLink(`https://www.tiktok.com/@${handle}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInfluencer]);

  // Load ALL influencers and campaigns when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    Promise.all([
      fetch("/api/influencers?limit=2000&minimal=true")
        .then((r) => (r.ok ? r.json() : { influencers: [] }))
        .then((d) => d.influencers ?? []),
      fetch("/api/marketing-campaigns")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d : d.campaigns ?? [])),
    ])
      .then(([inf, camp]) => {
        setInfluencers(inf);
        setCampaigns(camp);
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

  const selectInfluencer = (inf: InfluencerOption) => {
    setInfluencerId(inf.id);
    setSearchQuery("");
    setShowDropdown(false);
    // Auto-fill profile link — use stored URL or construct TikTok fallback
    if (inf.profileUrl) {
      setProfileLink(inf.profileUrl);
    } else {
      // Fallback: construct TikTok URL from username
      const handle = inf.username.startsWith(".")
        ? inf.username.slice(1)
        : inf.username;
      setProfileLink(`https://www.tiktok.com/@${handle}`);
    }
  };

  const clearInfluencer = () => {
    setInfluencerId("");
    setProfileLink("");
    setSearchQuery("");
  };

  const handleSubmit = async () => {
    if (!influencerId) {
      toast.error("Please select an influencer");
      return;
    }
    if (!rate || Number(rate) <= 0) {
      toast.error("Rate must be greater than 0");
      return;
    }
    if (!deliverables.trim()) {
      toast.error("Deliverables are required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId,
          rate: parseFloat(rate),
          currency: currency.trim() || "USD",
          deliverables: deliverables.trim(),
          notes: null,
          campaignId: campaignId || null,
          videosPerBundle: videosPerBundle ? parseInt(videosPerBundle) : null,
          ratePerVideo: ratePerVideo ? parseFloat(ratePerVideo) : null,
          totalPriceLocal: totalPriceLocal ? parseFloat(totalPriceLocal) : null,
          totalPriceUsd: totalPriceUsd ? parseFloat(totalPriceUsd) : null,
          profileLink: profileLink.trim() || null,
          picFeedback: picNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
      }

      toast.success("Approval request submitted");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit for Approval</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Searchable Influencer Select */}
          <div>
            <Label className="text-xs font-semibold">Influencer *</Label>

            {/* Selected influencer chip OR search input */}
            {selectedInfluencer && !prefill?.influencerId ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
                {selectedInfluencer.avatarProxied ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedInfluencer.avatarProxied}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] font-bold text-white">
                    {selectedInfluencer.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="flex-1 text-sm font-medium">
                  @{selectedInfluencer.username}
                  {selectedInfluencer.displayName
                    ? ` — ${selectedInfluencer.displayName}`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={clearInfluencer}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : prefill?.influencerId && selectedInfluencer ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-1.5 opacity-70">
                <span className="text-sm">
                  @{selectedInfluencer.username}
                </span>
              </div>
            ) : (
              <div ref={searchRef} className="relative mt-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={
                      loadingOptions
                        ? "Loading influencers..."
                        : "Search by username, name, country..."
                    }
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    disabled={loadingOptions}
                    className="pl-8"
                  />
                </div>

                {/* Dropdown list */}
                {showDropdown && !loadingOptions && (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
                    {filteredInfluencers.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {searchQuery
                          ? "No influencers found"
                          : "No influencers available"}
                      </div>
                    ) : (
                      filteredInfluencers.slice(0, 50).map((inf) => (
                        <button
                          key={inf.id}
                          type="button"
                          onClick={() => selectInfluencer(inf)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                        >
                          {inf.avatarProxied ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={inf.avatarProxied}
                              alt=""
                              className="h-7 w-7 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] font-bold text-white shrink-0">
                              {inf.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              @{inf.username}
                              {inf.displayName
                                ? ` — ${inf.displayName}`
                                : ""}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {inf.platform && <span>{inf.platform}</span>}
                              {inf.country && <span>{inf.country}</span>}
                              {inf.followers != null && (
                                <span>
                                  {formatFollowers(inf.followers)} followers
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                    {filteredInfluencers.length > 50 && (
                      <div className="px-3 py-2 text-center text-xs text-muted-foreground border-t">
                        Showing 50 of {filteredInfluencers.length} results —
                        type to narrow down
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Influencer Detail Card (shows when selected) */}
          {selectedInfluencer && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                {selectedInfluencer.avatarProxied ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedInfluencer.avatarProxied}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-bold text-white">
                    {selectedInfluencer.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      @{selectedInfluencer.username}
                    </span>
                    {selectedInfluencer.displayName && (
                      <span className="text-xs text-muted-foreground truncate">
                        {selectedInfluencer.displayName}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {selectedInfluencer.platform && (
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {selectedInfluencer.platform}
                      </span>
                    )}
                    {selectedInfluencer.country && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {selectedInfluencer.country}
                      </span>
                    )}
                    {selectedInfluencer.followers != null && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {formatFollowers(selectedInfluencer.followers)}
                      </span>
                    )}
                    {selectedInfluencer.engagementRate != null && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {selectedInfluencer.engagementRate}%
                      </span>
                    )}
                    {selectedInfluencer.email && (
                      <span className="truncate">
                        {selectedInfluencer.email}
                      </span>
                    )}
                    {selectedInfluencer.profileUrl && (
                      <a
                        href={selectedInfluencer.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Profile
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rate + Currency row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="approval-rate" className="text-xs font-semibold">
                Rate (Total) *
              </Label>
              <Input
                id="approval-rate"
                type="number"
                placeholder="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="mt-1"
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <Label
                htmlFor="approval-currency"
                className="text-xs font-semibold"
              >
                Currency
              </Label>
              <Input
                id="approval-currency"
                placeholder="USD"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Pricing details row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="approval-videos"
                className="text-xs font-semibold"
              >
                Videos per Bundle
              </Label>
              <Input
                id="approval-videos"
                type="number"
                placeholder="e.g. 3"
                value={videosPerBundle}
                onChange={(e) => setVideosPerBundle(e.target.value)}
                className="mt-1"
                min={1}
              />
            </div>
            <div>
              <Label htmlFor="approval-rpv" className="text-xs font-semibold">
                $ per Video (VAT incl.)
              </Label>
              <Input
                id="approval-rpv"
                type="number"
                placeholder="0.00"
                value={ratePerVideo}
                onChange={(e) => setRatePerVideo(e.target.value)}
                className="mt-1"
                min={0}
                step="0.01"
              />
            </div>
          </div>

          {/* Profile Link */}
          <div>
            <Label
              htmlFor="approval-profile"
              className="text-xs font-semibold"
            >
              Profile Link
            </Label>
            <Input
              id="approval-profile"
              type="url"
              placeholder="https://tiktok.com/@username"
              value={profileLink}
              onChange={(e) => setProfileLink(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Deliverables */}
          <div>
            <Label
              htmlFor="approval-deliverables"
              className="text-xs font-semibold"
            >
              Deliverables *
            </Label>
            <Textarea
              id="approval-deliverables"
              placeholder="e.g. 2 TikTok videos + 1 Instagram story"
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          {/* Campaign */}
          <div>
            <Label
              htmlFor="approval-campaign"
              className="text-xs font-semibold"
            >
              Campaign (optional)
            </Label>
            <select
              id="approval-campaign"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              disabled={loadingOptions}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* PIC Notes */}
          <div>
            <Label
              htmlFor="approval-pic-notes"
              className="text-xs font-semibold"
            >
              PIC Notes
            </Label>
            <Textarea
              id="approval-pic-notes"
              placeholder="Notes & recommendations for CEO review..."
              value={picNotes}
              onChange={(e) => setPicNotes(e.target.value)}
              rows={3}
              className="mt-1 resize-none"
            />
          </div>
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
            onClick={handleSubmit}
            disabled={
              loading || !influencerId || !rate || !deliverables.trim()
            }
          >
            {loading ? "Submitting..." : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
