"use client";

import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, XCircle, ArrowLeftRight } from "lucide-react";
import type { ApprovalRow } from "./page";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  approval: ApprovalRow | null;
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

export function ReviewApprovalDialog({
  open,
  onOpenChange,
  onSuccess,
  approval,
}: Props) {
  const [mode, setMode] = useState<"view" | "counter">("view");
  const [counterRate, setCounterRate] = useState("");
  const [counterNotes, setCounterNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (!approval) return null;

  const isPending = approval.status === "PENDING";

  const handleAction = async (action: "approve" | "reject" | "counter") => {
    if (action === "counter" && mode !== "counter") {
      setMode("counter");
      setCounterRate(approval.rate.toString());
      setCounterNotes("");
      return;
    }

    if (action === "counter" && (!counterRate || Number(counterRate) <= 0)) {
      toast.error("Counter rate must be greater than 0");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = { action };
      if (action === "counter") {
        payload.counterRate = parseFloat(counterRate);
        payload.counterNotes = counterNotes.trim() || null;
      }

      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }

      const labels = {
        approve: "Approval approved",
        reject: "Approval rejected",
        counter: "Counter-offer sent",
      };
      toast.success(labels[action]);
      setMode("view");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setMode("view");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Approval</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Influencer */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                Influencer
              </p>
              <p className="font-medium">
                @{approval.influencer.username}
                {approval.influencer.displayName &&
                  ` (${approval.influencer.displayName})`}
              </p>
            </div>
            <StatusBadge status={approval.status} />
          </div>

          {/* Submitted by */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Submitted by
            </p>
            <p className="text-sm">
              {approval.submittedBy.name || approval.submittedBy.email}
            </p>
          </div>

          {/* Rate + Deliverables */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                Proposed Rate
              </p>
              <p className="text-lg font-semibold">
                {formatCurrency(approval.rate, approval.currency)}
              </p>
            </div>
            {approval.campaign && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Campaign
                </p>
                <p className="text-sm">{approval.campaign.name}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              Deliverables
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {approval.deliverables}
            </p>
          </div>

          {approval.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{approval.notes}</p>
            </div>
          )}

          {/* Counter-offer details (if already counter-offered) */}
          {approval.status === "COUNTER_OFFERED" && approval.counterRate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                Counter-offer
              </p>
              <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                {formatCurrency(approval.counterRate, approval.currency)}
              </p>
              {approval.counterNotes && (
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  {approval.counterNotes}
                </p>
              )}
            </div>
          )}

          {/* Reviewed info */}
          {approval.reviewedBy && approval.reviewedAt && (
            <div className="text-xs text-muted-foreground">
              Reviewed by {approval.reviewedBy.name || approval.reviewedBy.email}{" "}
              on {new Date(approval.reviewedAt).toLocaleDateString()}
            </div>
          )}

          {/* Counter-offer form (admin, in counter mode) */}
          {isPending && mode === "counter" && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <div>
                <Label
                  htmlFor="counter-rate"
                  className="text-xs font-semibold"
                >
                  Counter Rate *
                </Label>
                <Input
                  id="counter-rate"
                  type="number"
                  value={counterRate}
                  onChange={(e) => setCounterRate(e.target.value)}
                  className="mt-1"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <Label
                  htmlFor="counter-notes"
                  className="text-xs font-semibold"
                >
                  Notes
                </Label>
                <Textarea
                  id="counter-notes"
                  placeholder="Reason for counter-offer..."
                  value={counterNotes}
                  onChange={(e) => setCounterNotes(e.target.value)}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {isPending ? (
            mode === "counter" ? (
              <div className="flex w-full justify-between">
                <Button
                  variant="outline"
                  onClick={() => setMode("view")}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => handleAction("counter")}
                  disabled={loading || !counterRate}
                >
                  {loading ? "Sending..." : "Send Counter-offer"}
                </Button>
              </div>
            ) : (
              <div className="flex w-full gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <div className="flex-1" />
                <Button
                  variant="destructive"
                  onClick={() => handleAction("reject")}
                  disabled={loading}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Reject
                </Button>
                <Button
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => handleAction("counter")}
                  disabled={loading}
                >
                  <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                  Counter
                </Button>
                <Button
                  className="bg-green-600 text-white hover:bg-green-700"
                  onClick={() => handleAction("approve")}
                  disabled={loading}
                >
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                  Approve
                </Button>
              </div>
            )
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: "Pending",
      className:
        "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700",
    },
    APPROVED: {
      label: "Approved",
      className:
        "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700",
    },
    REJECTED: {
      label: "Rejected",
      className:
        "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700",
    },
    COUNTER_OFFERED: {
      label: "Counter-offered",
      className:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700",
    },
  };
  const c = config[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}
