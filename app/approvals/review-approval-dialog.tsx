"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  MapPin,
  Star,
  Loader2,
} from "lucide-react";
import type { ApprovalRow } from "./page";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  approval: ApprovalRow | null;
  isAdmin?: boolean;
  onResubmit?: (approval: ApprovalRow) => void;
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

const CONTRACT_STATUS_OPTIONS = [
  { value: "", label: "— Not set —" },
  { value: "NEGOTIATE", label: "Negotiate" },
  { value: "APPROVED", label: "Approved" },
  { value: "DROP", label: "Rejected" },
];

export function ReviewApprovalDialog({
  open,
  onOpenChange,
  onSuccess,
  approval,
  isAdmin = false,
  onResubmit,
}: Props) {
  const [loading, setLoading] = useState(false);

  // CEO feedback — unified (feedback + counter-offer in one field)
  const [ceoFeedback, setCeoFeedback] = useState("");
  const [counterRate, setCounterRate] = useState("");
  const [contractStatus, setContractStatus] = useState("NEGOTIATE");
  const [isSpecial, setIsSpecial] = useState(false);

  // Auto-save debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const lastSaved = useRef({ ceoFeedback: "", counterRate: "", contractStatus: "", isSpecial: false });

  // Inline resubmit state (PIC)
  const [resubmitMode, setResubmitMode] = useState(false);
  const [resubmitRate, setResubmitRate] = useState("");
  const [resubmitNotes, setResubmitNotes] = useState("");
  const [submittingResubmit, setSubmittingResubmit] = useState(false);

  // Negotiation history
  const [history, setHistory] = useState<ApprovalRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reset editable fields when approval changes
  useEffect(() => {
    if (approval) {
      const fb = approval.ceoFeedback ?? "";
      const cr = approval.counterRate?.toString() ?? "";
      const cs = approval.contractStatus ?? "";
      const sp = approval.feedbackStatus === "SPECIAL";
      setCeoFeedback(fb);
      setCounterRate(cr);
      setContractStatus(cs);
      setIsSpecial(sp);
      setResubmitMode(false);
      lastSaved.current = { ceoFeedback: fb, counterRate: cr, contractStatus: cs, isSpecial: sp };
    }
  }, [approval]);

  // Fetch negotiation history for this influencer
  useEffect(() => {
    if (!approval || !open) return;
    let cancelled = false;
    setLoadingHistory(true);
    fetch(`/api/approvals?influencerId=${approval.influencer.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        // All approvals for this influencer except current, sorted oldest first
        const others = (data.approvals as ApprovalRow[])
          .filter((a) => a.id !== approval.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        setHistory(others);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingHistory(false); });
    return () => { cancelled = true; };
  }, [approval, open]);

  // Auto-save function
  const doAutoSave = useCallback(async () => {
    if (!approval || !isAdmin) return;
    const current = { ceoFeedback, counterRate, contractStatus, isSpecial };
    // Skip if nothing changed
    if (
      current.ceoFeedback === lastSaved.current.ceoFeedback &&
      current.counterRate === lastSaved.current.counterRate &&
      current.contractStatus === lastSaved.current.contractStatus &&
      current.isSpecial === lastSaved.current.isSpecial
    ) return;

    setAutoSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: "update",
        ceoFeedback: current.ceoFeedback.trim() || "",
        contractStatus: current.contractStatus,
        feedbackStatus: current.isSpecial ? "SPECIAL" : undefined,
      };
      // Save counter rate if provided
      if (current.counterRate && Number(current.counterRate) > 0) {
        payload.counterRate = parseFloat(current.counterRate);
      }

      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        lastSaved.current = current;
      }
    } catch {
      // Silently fail auto-save
    } finally {
      setAutoSaving(false);
    }
  }, [approval, isAdmin, ceoFeedback, counterRate, contractStatus, isSpecial]);

  // Trigger auto-save on changes (1.5s debounce)
  useEffect(() => {
    if (!isAdmin || !approval) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [ceoFeedback, counterRate, contractStatus, isSpecial, doAutoSave, isAdmin, approval]);

  const handleInlineResubmit = async () => {
    if (!approval || !resubmitRate) return;
    setSubmittingResubmit(true);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId: approval.influencer.id,
          rate: parseFloat(resubmitRate),
          currency: approval.currency,
          deliverables: approval.deliverables,
          notes: resubmitNotes.trim() || `Re-negotiated from ${approval.currency} ${approval.counterRate}`,
          campaignId: approval.campaign?.id || undefined,
          videosPerBundle: approval.videosPerBundle,
          ratePerVideo: approval.ratePerVideo,
          profileLink: approval.profileLink,
        }),
      });
      if (!res.ok) throw new Error("Failed to submit");
      toast.success("Re-submitted for approval");
      setResubmitMode(false);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to re-submit");
    } finally {
      setSubmittingResubmit(false);
    }
  };

  if (!approval) return null;

  const isPending = approval.status === "PENDING";
  const inf = approval.influencer;

  const handleAction = async (action: "approve" | "reject" | "counter") => {
    // For counter, must have a rate
    if (action === "counter" && (!counterRate || Number(counterRate) <= 0)) {
      toast.error("Enter a counter rate before sending counter-offer");
      return;
    }

    setLoading(true);
    try {
      // Flush any pending auto-save first
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

      const payload: Record<string, unknown> = { action };
      if (action === "counter") {
        payload.counterRate = parseFloat(counterRate);
        payload.counterNotes = ceoFeedback.trim() || null;
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
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setLoading(false);
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
        // Auto-save before close
        if (!v && isAdmin) doAutoSave();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Review Approval</DialogTitle>
            <div className="flex items-center gap-2">
              {autoSaving && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
              <StatusBadge status={approval.status} />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Influencer detail card ── */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white">
                {inf.avatarProxied ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inf.avatarProxied}
                    alt={inf.username}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  inf.username.charAt(0).toUpperCase()
                )}
              </div>

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
                  <p className="text-xs text-muted-foreground">Per Video (VAT incl.)</p>
                  <p className="text-lg font-bold">
                    {approval.currency} {approval.ratePerVideo.toLocaleString()}
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

          {/* ── Negotiation History ── */}
          {history.length > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Negotiation History
              </h4>
              <div className="space-y-2.5">
                {history.map((h) => (
                  <div key={h.id} className="relative pl-4 border-l-2 border-muted pb-2 last:pb-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{h.submittedBy.name || h.submittedBy.email}</span>
                      <span className="text-muted-foreground">proposed</span>
                      <span className="font-bold">{h.currency} {h.rate.toLocaleString()}</span>
                      <StatusDot status={h.status} />
                      <span className="text-muted-foreground ml-auto">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {h.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>
                    )}
                    {h.counterRate && (
                      <div className="mt-1 text-xs">
                        <span className="text-amber-700 font-medium">
                          CEO countered: {h.currency} {h.counterRate.toLocaleString()}
                        </span>
                        {h.counterNotes && (
                          <span className="text-muted-foreground ml-1">— {h.counterNotes}</span>
                        )}
                      </div>
                    )}
                    {h.ceoFeedback && (
                      <p className="text-xs text-purple-700 mt-0.5">CEO: {h.ceoFeedback}</p>
                    )}
                  </div>
                ))}
                {/* Current round */}
                <div className="relative pl-4 border-l-2 border-primary">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{approval.submittedBy.name || approval.submittedBy.email}</span>
                    <span className="text-muted-foreground">proposed</span>
                    <span className="font-bold">{approval.currency} {approval.rate.toLocaleString()}</span>
                    <StatusDot status={approval.status} />
                    <span className="text-muted-foreground ml-auto">
                      {new Date(approval.createdAt).toLocaleDateString()} (current)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CEO Review Section (simplified — unified feedback + counter) ── */}
          <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
                CEO Review
              </h4>
            </div>

            {/* Feedback + Counter rate in one section */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Counter rate */}
              <div>
                <Label className="text-xs font-semibold">
                  Counter Rate
                </Label>
                {isAdmin ? (
                  <Input
                    type="number"
                    placeholder="e.g. 800"
                    value={counterRate}
                    onChange={(e) => setCounterRate(e.target.value)}
                    className="mt-1"
                    min={0}
                    step="0.01"
                  />
                ) : (
                  <p className="mt-1 text-lg font-bold">
                    {counterRate ? Number(counterRate).toLocaleString() : "—"}
                  </p>
                )}
              </div>

              {/* Contract status */}
              <div>
                <Label className="text-xs font-semibold">Decision</Label>
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

            {/* CEO Feedback textarea */}
            <div>
              <Label className="text-xs font-semibold">
                Feedback & Notes
              </Label>
              {isAdmin ? (
                <Textarea
                  placeholder="Write feedback, counter-offer reasoning, or notes for the PIC..."
                  value={ceoFeedback}
                  onChange={(e) => setCeoFeedback(e.target.value)}
                  rows={3}
                  className="mt-1 resize-none"
                />
              ) : (
                <p className="mt-1 text-sm whitespace-pre-wrap rounded-md bg-background p-3 min-h-[60px]">
                  {ceoFeedback || "No feedback yet."}
                </p>
              )}
              {isAdmin && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Auto-saved as you type
                </p>
              )}
            </div>
          </div>

          {/* ── Counter-offer from CEO + inline resubmit ── */}
          {approval.status === "COUNTER_OFFERED" && approval.counterRate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Counter-offer from CEO
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
                {!isAdmin && !resubmitMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                    onClick={() => {
                      setResubmitRate(approval.counterRate?.toString() ?? approval.rate.toString());
                      setResubmitNotes("");
                      setResubmitMode(true);
                    }}
                  >
                    <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                    Re-negotiate
                  </Button>
                )}
              </div>

              {/* Inline resubmit form */}
              {!isAdmin && resubmitMode && (
                <div className="border-t border-amber-200 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Your counter-proposal
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs font-semibold text-amber-800">New Rate</Label>
                      <Input
                        type="number"
                        value={resubmitRate}
                        onChange={(e) => setResubmitRate(e.target.value)}
                        className="mt-1 border-amber-300 bg-white"
                        min={0}
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-amber-800">Notes</Label>
                      <Input
                        value={resubmitNotes}
                        onChange={(e) => setResubmitNotes(e.target.value)}
                        placeholder="e.g. Negotiated down to..."
                        className="mt-1 border-amber-300 bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setResubmitMode(false)}
                      disabled={submittingResubmit}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      onClick={handleInlineResubmit}
                      disabled={submittingResubmit || !resubmitRate || Number(resubmitRate) <= 0}
                    >
                      {submittingResubmit ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </div>
                </div>
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
        </div>

        <DialogFooter>
          {isPending && isAdmin ? (
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Close
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
                disabled={loading || !counterRate || Number(counterRate) <= 0}
                title={!counterRate ? "Enter a counter rate first" : undefined}
              >
                <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />
                Send Counter
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

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-400",
    APPROVED: "bg-green-500",
    REJECTED: "bg-red-500",
    COUNTER_OFFERED: "bg-amber-500",
  };
  const labels: Record<string, string> = {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    COUNTER_OFFERED: "Countered",
  };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[status] ?? "bg-gray-400"}`} />
      {labels[status] ?? status}
    </span>
  );
}
