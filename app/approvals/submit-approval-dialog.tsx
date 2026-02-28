"use client";

import { useEffect, useState } from "react";
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

type InfluencerOption = {
  id: string;
  username: string;
  displayName: string | null;
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
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens or prefill changes
  useEffect(() => {
    if (open) {
      setInfluencerId(prefill?.influencerId ?? "");
      setRate(prefill?.rate?.toString() ?? "");
      setCurrency(prefill?.currency ?? "USD");
      setDeliverables(prefill?.deliverables ?? "");
      setNotes(prefill?.notes ?? "");
      setCampaignId(prefill?.campaignId ?? "");
    }
  }, [open, prefill]);

  // Load influencers (NEGOTIATING stage) and campaigns when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingOptions(true);
    Promise.all([
      fetch("/api/influencers?pipelineStage=NEGOTIATING&limit=500")
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
      <DialogContent className="sm:max-w-lg">
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
                </option>
              ))}
            </select>
          </div>

          {/* Rate + Currency row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="approval-rate" className="text-xs font-semibold">
                Rate *
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
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          {/* Notes */}
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

          {/* Campaign */}
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
