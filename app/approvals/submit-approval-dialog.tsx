"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Globe, Users, TrendingUp, MapPin, ExternalLink } from "lucide-react";

type InfluencerOption = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
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
  const [notes, setNotes] = useState(prefill?.notes ?? "");
  const [campaignId, setCampaignId] = useState(prefill?.campaignId ?? "");

  // New pricing fields
  const [videosPerBundle, setVideosPerBundle] = useState("");
  const [ratePerVideo, setRatePerVideo] = useState("");
  const [totalPriceLocal, setTotalPriceLocal] = useState("");
  const [totalPriceUsd, setTotalPriceUsd] = useState("");
  const [profileLink, setProfileLink] = useState("");
  const [picFeedback, setPicFeedback] = useState("");

  const [loading, setLoading] = useState(false);

  // Selected influencer details
  const selectedInfluencer = useMemo(
    () => influencers.find((i) => i.id === influencerId) ?? null,
    [influencers, influencerId],
  );

  // Reset form when dialog opens or prefill changes
  useEffect(() => {
    if (open) {
      setInfluencerId(prefill?.influencerId ?? "");
      setRate(prefill?.rate?.toString() ?? "");
      setCurrency(prefill?.currency ?? "USD");
      setDeliverables(prefill?.deliverables ?? "");
      setNotes(prefill?.notes ?? "");
      setCampaignId(prefill?.campaignId ?? "");
      setVideosPerBundle("");
      setRatePerVideo("");
      setTotalPriceLocal("");
      setTotalPriceUsd("");
      setProfileLink("");
      setPicFeedback("");
    }
  }, [open, prefill]);

  // Auto-fill profile link when influencer selected
  useEffect(() => {
    if (selectedInfluencer?.profileUrl && !profileLink) {
      setProfileLink(selectedInfluencer.profileUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInfluencer]);

  // Load influencers (NEGOTIATING stage) and campaigns when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    Promise.all([
      fetch("/api/influencers?pipelineStage=NEGOTIATING&limit=500&minimal=true")
        .then((r) => (r.ok ? r.json() : { influencers: [] }))
        .then((d) => d.influencers ?? []),
      fetch("/api/marketing-campaigns")
        .then((r) => (r.ok ? r.json() : { campaigns: [] }))
        .then((d) => d.campaigns ?? []),
    ])
      .then(([inf, camp]) => {
        setInfluencers(inf);
        setCampaigns(camp);
      })
      .finally(() => setLoadingOptions(false));
  }, [open]);

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
          notes: notes.trim() || null,
          campaignId: campaignId || null,
          videosPerBundle: videosPerBundle ? parseInt(videosPerBundle) : null,
          ratePerVideo: ratePerVideo ? parseFloat(ratePerVideo) : null,
          totalPriceLocal: totalPriceLocal ? parseFloat(totalPriceLocal) : null,
          totalPriceUsd: totalPriceUsd ? parseFloat(totalPriceUsd) : null,
          profileLink: profileLink.trim() || null,
          picFeedback: picFeedback.trim() || null,
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
          {/* Influencer select */}
          <div>
            <Label htmlFor="approval-influencer" className="text-xs font-semibold">
              Influencer *
            </Label>
            <select
              id="approval-influencer"
              value={influencerId}
              onChange={(e) => setInfluencerId(e.target.value)}
              disabled={loadingOptions || !!prefill?.influencerId}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value="">
                {loadingOptions ? "Loading..." : "Select influencer (Negotiating stage)"}
              </option>
              {influencers.map((inf) => (
                <option key={inf.id} value={inf.id}>
                  @{inf.username}
                  {inf.displayName ? ` — ${inf.displayName}` : ""}
                  {inf.platform ? ` · ${inf.platform}` : ""}
                  {inf.country ? ` · ${inf.country}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* ── Influencer Detail Card (shows when selected) ── */}
          {selectedInfluencer && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                {selectedInfluencer.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedInfluencer.avatarUrl}
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
                      <span className="truncate">{selectedInfluencer.email}</span>
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
              <Label htmlFor="approval-currency" className="text-xs font-semibold">
                통화 단위 (Currency)
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
              <Label htmlFor="approval-videos" className="text-xs font-semibold">
                번들 당 영상 갯수 (Videos/Bundle)
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
                $/Video (VAT 포함)
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

          {/* Total prices row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="approval-local" className="text-xs font-semibold">
                인플루언서 제시 총 가격 (Local)
              </Label>
              <Input
                id="approval-local"
                type="number"
                placeholder="0.00"
                value={totalPriceLocal}
                onChange={(e) => setTotalPriceLocal(e.target.value)}
                className="mt-1"
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="approval-usd" className="text-xs font-semibold">
                인플루언서 제시 총 가격 ($)
              </Label>
              <Input
                id="approval-usd"
                type="number"
                placeholder="0.00"
                value={totalPriceUsd}
                onChange={(e) => setTotalPriceUsd(e.target.value)}
                className="mt-1"
                min={0}
                step="0.01"
              />
            </div>
          </div>

          {/* Profile Link */}
          <div>
            <Label htmlFor="approval-profile" className="text-xs font-semibold">
              프로필 링크 (Profile Link)
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
            <Label htmlFor="approval-deliverables" className="text-xs font-semibold">
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

          {/* PIC Feedback */}
          <div>
            <Label htmlFor="approval-pic-feedback" className="text-xs font-semibold">
              담당자 피드백 (PIC Feedback)
            </Label>
            <Textarea
              id="approval-pic-feedback"
              placeholder="Recommendation for CEO review..."
              value={picFeedback}
              onChange={(e) => setPicFeedback(e.target.value)}
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          {/* Notes + Campaign */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="approval-notes" className="text-xs font-semibold">
                Notes
              </Label>
              <Textarea
                id="approval-notes"
                placeholder="Any additional context..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 resize-none"
              />
            </div>
            <div>
              <Label htmlFor="approval-campaign" className="text-xs font-semibold">
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
            disabled={loading || !influencerId || !rate || !deliverables.trim()}
          >
            {loading ? "Submitting..." : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
