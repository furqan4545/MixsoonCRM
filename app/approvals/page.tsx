"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  XCircle,
  ArrowLeftRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmitApprovalDialog } from "./submit-approval-dialog";
import { ReviewApprovalDialog } from "./review-approval-dialog";

/* ───────────── types ───────────── */

export interface ApprovalRow {
  id: string;
  influencer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    rate: number | null;
  };
  submittedBy: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
  campaign: { id: string; name: string } | null;
  rate: number;
  currency: string;
  deliverables: string;
  notes: string | null;
  status: string;
  counterRate: number | null;
  counterNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const TABS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending", icon: Clock },
  { key: "APPROVED", label: "Approved", icon: CheckCircle },
  { key: "REJECTED", label: "Rejected", icon: XCircle },
  { key: "COUNTER_OFFERED", label: "Counter-offered", icon: ArrowLeftRight },
] as const;

/* ───────────── helpers ───────────── */

function statusBadge(status: string) {
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString()}`;
}

/* ───────────── page ───────────── */

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "Admin";
  const hasWrite = (session?.user?.permissions ?? []).some(
    (p: { feature: string; action: string }) =>
      p.feature === "approvals" && p.action === "write",
  );

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ALL");

  // Dialogs
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitPrefill, setSubmitPrefill] = useState<{
    influencerId?: string;
    rate?: number;
    currency?: string;
    deliverables?: string;
    notes?: string;
    campaignId?: string;
  } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRow | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setApprovals(data.approvals ?? []);
    } catch {
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Tab counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: approvals.length };
    for (const a of approvals) {
      c[a.status] = (c[a.status] ?? 0) + 1;
    }
    return c;
  }, [approvals]);

  // Filtered list
  const filtered = useMemo(() => {
    if (activeTab === "ALL") return approvals;
    return approvals.filter((a) => a.status === activeTab);
  }, [approvals, activeTab]);

  function openReview(row: ApprovalRow) {
    setSelectedApproval(row);
    setReviewOpen(true);
  }

  function openResubmit(row: ApprovalRow) {
    setSubmitPrefill({
      influencerId: row.influencer.id,
      rate: row.counterRate ?? row.rate,
      currency: row.currency,
      deliverables: row.deliverables,
      notes: row.counterNotes
        ? `Re-submit: counter was ${row.currency} ${row.counterRate}. ${row.counterNotes}`
        : undefined,
      campaignId: row.campaign?.id,
    });
    setSubmitOpen(true);
  }

  function openNewSubmit() {
    setSubmitPrefill(null);
    setSubmitOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Review and approve influencer rate submissions."
              : "Submit influencer rates for approval and track their status."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {hasWrite && !isAdmin && (
            <Button size="sm" onClick={openNewSubmit}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Submit Approval
            </Button>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const count = counts[tab.key] ?? 0;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-accent border-input"
              }`}
            >
              {tab.icon && <tab.icon className="h-3 w-3" />}
              {tab.label}
              {count > 0 && (
                <span
                  className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                    active
                      ? "bg-primary-foreground/20"
                      : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="font-medium">
            {activeTab === "ALL"
              ? "No approval requests yet"
              : `No ${activeTab.toLowerCase().replace("_", "-")} approvals`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!isAdmin && hasWrite
              ? "Submit your first approval request using the button above."
              : "Approval requests will appear here."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Influencer</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Deliverables
                  </TableHead>
                  {isAdmin && (
                    <TableHead className="hidden lg:table-cell">
                      Campaign
                    </TableHead>
                  )}
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      isAdmin && row.status === "PENDING"
                        ? "cursor-pointer hover:bg-muted/50"
                        : ""
                    }
                    onClick={() => {
                      if (isAdmin && row.status === "PENDING") {
                        openReview(row);
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      @{row.influencer.username}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.submittedBy.name || row.submittedBy.email}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(row.rate, row.currency)}
                      {row.counterRate && (
                        <div className="text-xs text-amber-600">
                          Counter: {formatCurrency(row.counterRate, row.currency)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] truncate text-sm md:table-cell">
                      {row.deliverables}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="hidden text-sm lg:table-cell">
                        {row.campaign?.name ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      {/* PIC: re-submit on counter-offered */}
                      {!isAdmin &&
                        row.status === "COUNTER_OFFERED" &&
                        hasWrite && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openResubmit(row);
                            }}
                          >
                            Re-submit
                          </Button>
                        )}
                      {/* Admin: view non-pending or click pending row */}
                      {isAdmin && row.status !== "PENDING" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openReview(row);
                          }}
                        >
                          View
                        </Button>
                      )}
                      {/* PIC: view details */}
                      {!isAdmin && row.status !== "COUNTER_OFFERED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openReview(row);
                          }}
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Submit dialog */}
      <SubmitApprovalDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSuccess={load}
        prefill={submitPrefill}
      />

      {/* Review dialog */}
      <ReviewApprovalDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={load}
        approval={selectedApproval}
      />
    </div>
  );
}
