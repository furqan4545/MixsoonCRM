"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import type { CampaignRow } from "./campaigns-dashboard";

const STATUSES = [
  { key: "PLANNING", label: "Planning", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { key: "ACTIVE", label: "Active", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { key: "PAUSED", label: "Paused", color: "bg-amber-100 text-amber-800 border-amber-300" },
  { key: "COMPLETED", label: "Completed", color: "bg-gray-100 text-gray-700 border-gray-300" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  campaign?: CampaignRow | null;
}

export function CampaignDialog({ open, onOpenChange, onSuccess, campaign }: Props) {
  const router = useRouter();
  const isEdit = !!campaign;

  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [budget, setBudget] = useState(campaign?.budget?.toString() ?? "");
  const [startDate, setStartDate] = useState(
    campaign?.startDate ? campaign.startDate.split("T")[0] : "",
  );
  const [endDate, setEndDate] = useState(
    campaign?.endDate ? campaign.endDate.split("T")[0] : "",
  );
  const [status, setStatus] = useState(campaign?.status ?? "PLANNING");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        budget: budget ? parseFloat(budget) : null,
        startDate: startDate || null,
        endDate: endDate || null,
        status,
      };

      const url = isEdit
        ? `/api/marketing-campaigns/${campaign!.id}`
        : "/api/marketing-campaigns";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success(isEdit ? "Campaign updated" : "Campaign created");
      router.refresh();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Campaign" : "New Campaign"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div>
            <Label htmlFor="campaign-name" className="text-xs font-semibold">
              Campaign Name *
            </Label>
            <Input
              id="campaign-name"
              placeholder="e.g. Summer 2026 Launch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="campaign-desc" className="text-xs font-semibold">
              Description
            </Label>
            <Textarea
              id="campaign-desc"
              placeholder="Campaign goals, notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 resize-none"
            />
          </div>

          {/* Budget + Dates row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="campaign-budget" className="text-xs font-semibold">
                Budget ($)
              </Label>
              <Input
                id="campaign-budget"
                type="number"
                placeholder="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="mt-1"
                min={0}
              />
            </div>
            <div>
              <Label htmlFor="campaign-start" className="text-xs font-semibold">
                Start Date
              </Label>
              <input
                id="campaign-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <Label htmlFor="campaign-end" className="text-xs font-semibold">
                End Date
              </Label>
              <input
                id="campaign-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Status pills */}
          <div>
            <Label className="text-xs font-semibold">Status</Label>
            <div className="mt-1.5 flex items-center gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatus(s.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    status === s.key
                      ? `${s.color} ring-2 ring-offset-1 ring-gray-400`
                      : "bg-background text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s.label}
                </button>
              ))}
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
          <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
            {loading
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
