"use client";

import { useState, useEffect } from "react";
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
import {
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  ExternalLink,
  Globe,
  Users,
  TrendingUp,
  Save,
  MapPin,
} from "lucide-react";
import type { ApprovalRow } from "./page";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  approval: ApprovalRow | null;
  isAdmin?: boolean;
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

const FEEDBACK_STATUS_OPTIONS = [
  { value: "REQUESTED", label: "Requested" },
  { value: "CEO_REVIEWED", label: "CEO Reviewed" },
  { value: "APPLIED", label: "Applied" },
  { value: "SPECIAL", label: "Special" },
];

const CONTRACT_STATUS_OPTIONS = [
  { value: "NEGOTIATE", label: "Negotiate" },
  { value: "APPROVED", label: "Approved" },
  { value: "DROP", label: "Drop" },
  { value: "FINAL_DROP", label: "Final Drop" },
];

export function ReviewApprovalDialog({
  open,
  onOpenChange,
  onSuccess,
  approval,
  isAdmin = false,
}: Props) {
  const [mode, setMode] = useState<"view" | "counter">("view");
  const [counterRate, setCounterRate] = useState("");
  const [counterNotes, setCounterNotes] = useState("");
  const [loading, setLoading] = useState(false);

  // CEO feedback fields (editable by admin)
  const [ceoFeedback, setCeoFeedback] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("REQUESTED");
  const [contractStatus, setContractStatus] = useState("NEGOTIATE");
  const [savingFeedback, setSavingFeedback] = useState(false);

  // Reset editable fields when approval changes
  useEffect(() => {
    if (approval) {
      setCeoFeedback(approval.ceoFeedback ?? "");
      setFeedbackStatus(approval.feedbackStatus ?? "REQUESTED");
      setContractStatus(approval.contractStatus ?? "NEGOTIATE");
    }
  }, [approval]);

  if (!approval) return null;

  const isPending = approval.status === "PENDING";
  const inf = approval.influencer;

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

  const handleSaveFeedback = async () => {
    setSavingFeedback(true);
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          ceoFeedback: ceoFeedback.trim() || "",
          feedbackStatus,
          contractStatus,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      toast.success("Feedback saved");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingFeedback(false);
    }
  };

  const formatFollowers = (n: number | null) => {
    if (!n) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setMode("view");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Review Approval</DialogTitle>
            <StatusBadge status={approval.status} />
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Influencer detail card ── */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white">
                {inf.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inf.avatarUrl}
                    alt={inf.username}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  inf.username.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base truncate">
                    @{inf.username}
                  </h3>
                  {inf.displayName && (
                    <span className="text-sm text-muted-foreground truncate">
                      {inf.displayName}
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {inf.platform && (
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {inf.platform}
                    </span>
                  )}
                  {inf.country && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {inf.country}
                    </span>
                  )}
                  {inf.followers != null && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {formatFollowers(inf.followers)} followers
                    </span>
                  )}
                  {inf.engagementRate != null && (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {inf.engagementRate}% engagement
                    </span>
                  )}
                </div>

                {/* Profile links */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {inf.profileUrl && (
                    <a
                      href={inf.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Profile
                    </a>
                  )}
                  {approval.profileLink && (
                    <a
                      href={approval.profileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-500/20 transition-colors dark:text-blue-400"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Submitted Link
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Submitted by ── */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Submitted by</span>
            <span className="font-medium">
              {approval.submittedBy.name || approval.submittedBy.email}
            </span>
          </div>

          {/* ── Pricing grid ── */}
          <div className="rounded-lg border p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pricing Details
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Proposed Rate</p>
                <p className="text-lg font-bold">
                  {formatCurrency(approval.rate, approval.currency)}
                </p>
              </div>
              {approval.videosPerBundle != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Videos/Bundle</p>
                  <p className="text-lg font-bold">{approval.videosPerBundle}</p>
                </div>
              )}
              {approval.ratePerVideo != null && (
                <div>
                  <p className="text-xs text-muted-foreground">$/Video (VAT incl.)</p>
                  <p className="text-lg font-bold">
                    ${approval.ratePerVideo.toLocaleString()}
                  </p>
                </div>
              )}
              {approval.totalPriceLocal != null && (
                <div>
                  <p className="text-xs text-muted-foreground">
                    Total (Local)
                  </p>
                  <p className="text-lg font-bold">
                    {approval.currency} {approval.totalPriceLocal.toLocaleString()}
                  </p>
                </div>
              )}
              {approval.totalPriceUsd != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Total (USD)</p>
                  <p className="text-lg font-bold">
                    ${approval.totalPriceUsd.toLocaleString()}
                  </p>
                </div>
              )}
              {approval.campaign && (
                <div>
                  <p className="text-xs text-muted-foreground">Campaign</p>
                  <p className="text-sm font-medium">{approval.campaign.name}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Deliverables ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              Deliverables
            </p>
            <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">
              {approval.deliverables}
            </p>
          </div>

          {approval.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{approval.notes}</p>
            </div>
          )}

          {/* ── PIC Notes (read-only) ── */}
          {approval.picFeedback && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                PIC Notes
              </p>
              <p className="text-sm whitespace-pre-wrap rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                {approval.picFeedback}
              </p>
            </div>
          )}

          {/* ── CEO Feedback Section (admin editable) ── */}
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
              CEO Review
            </h4>

            {/* CEO Feedback textarea */}
            <div>
              <Label className="text-xs font-semibold">
                CEO Feedback
              </Label>
              {isAdmin ? (
                <Textarea
                  placeholder="Write your feedback for the PIC..."
                  value={ceoFeedback}
                  onChange={(e) => setCeoFeedback(e.target.value)}
                  rows={3}
                  className="mt-1 resize-none"
                />
              ) : (
                <p className="mt-1 text-sm whitespace-pre-wrap rounded-md bg-background p-3 min-h-[60px]">
                  {ceoFeedback || "—"}
                </p>
              )}
            </div>

            {/* Status dropdowns */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">
                  Feedback Status
                </Label>
                {isAdmin ? (
                  <select
                    value={feedbackStatus}
                    onChange={(e) => setFeedbackStatus(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {FEEDBACK_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1">
                    <FeedbackBadge status={feedbackStatus} />
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  Contract Status
                </Label>
                {isAdmin ? (
                  <select
                    value={contractStatus}
                    onChange={(e) => setContractStatus(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {CONTRACT_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="mt-1">
                    <ContractBadge status={contractStatus} />
                  </p>
                )}
              </div>
            </div>

            {/* Save Feedback button (admin only) */}
            {isAdmin && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveFeedback}
                  disabled={savingFeedback}
                  className="border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingFeedback ? "Saving..." : "Save Feedback"}
                </Button>
              </div>
            )}
          </div>

          {/* ── Counter-offer details (if already counter-offered) ── */}
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
          {isPending && isAdmin && mode === "counter" && (
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
          {isPending && isAdmin ? (
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

/* ── Badge components ── */

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

function FeedbackBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    REQUESTED: {
      label: "Requested",
      className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200",
    },
    CEO_REVIEWED: {
      label: "CEO Reviewed",
      className: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200",
    },
    APPLIED: {
      label: "Applied",
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200",
    },
    SPECIAL: {
      label: "Special",
      className: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/30 dark:text-pink-200",
    },
  };
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

function ContractBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    NEGOTIATE: {
      label: "Negotiate",
      className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200",
    },
    APPROVED: {
      label: "Approved",
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200",
    },
    DROP: {
      label: "Drop",
      className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200",
    },
    FINAL_DROP: {
      label: "Final Drop",
      className: "bg-red-200 text-red-900 border-red-400 dark:bg-red-900/50 dark:text-red-100",
    },
  };
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}
