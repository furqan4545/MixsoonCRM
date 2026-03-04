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
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    followers: number | null;
    platform: string | null;
    country: string | null;
    engagementRate: number | null;
    profileUrl: string | null;
  };
  submittedBy: { id: string; name: string | null; email: string };
  reviewedBy: { id: string; name: string | null; email: string } | null;
  campaign: { id: string; name: string } | null;
  rate: number;
  currency: string;
  deliverables: string;
  notes: string | null;
  videosPerBundle: number | null;
  ratePerVideo: number | null;
  totalPriceLocal: number | null;
  totalPriceUsd: number | null;
  profileLink: string | null;
  picFeedback: string | null;
  ceoFeedback: string | null;
  feedbackStatus: string;
  contractStatus: string;
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
      label: "Counter",
      className:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700",
    },
  };
  const c = config[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-800 border-gray-300",
  };
  return (
    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function feedbackStatusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    REQUESTED: {
      label: "피드백 요청",
      className:
        "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700",
    },
    CEO_REVIEWED: {
      label: "대표님 피드백",
      className:
        "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700",
    },
    APPLIED: {
      label: "반영 완료",
      className:
        "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700",
    },
    SPECIAL: {
      label: "특별 관리",
      className:
        "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/30 dark:text-pink-200 dark:border-pink-700",
    },
  };
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-800 border-gray-300" };
  return (
    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function contractStatusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    NEGOTIATE: {
      label: "Negotiate",
      className:
        "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700",
    },
    APPROVED: {
      label: "Approved",
      className:
        "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700",
    },
    DROP: {
      label: "Drop",
      className:
        "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-700",
    },
    FINAL_DROP: {
      label: "Final Drop",
      className:
        "bg-red-200 text-red-900 border-red-400 dark:bg-red-900/50 dark:text-red-100 dark:border-red-600",
    },
  };
  const c = config[status] ?? { label: status, className: "bg-gray-100 text-gray-800 border-gray-300" };
  return (
    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${c.className}`}>
      {c.label}
    </Badge>
  );
}

function formatFollowers(n: number | null) {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
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
          {hasWrite && (
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Username</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">담당자 (PIC)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Country</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Platform</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Followers</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">번들 당 영상 갯수</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">통화 단위</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">$/Video (VAT)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">총 가격 (Local)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">총 가격 ($)</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap max-w-[200px]">담당자 피드백</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">프로필 링크</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap max-w-[200px]">주업님 Feedback</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">피드백 진행 사항</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">계약현황</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap w-[1%]" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => openReview(row)}
                  >
                    {/* Username (sticky) */}
                    <td className="sticky left-0 z-10 bg-card px-3 py-2.5 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {row.influencer.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.influencer.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] font-bold text-white">
                            {row.influencer.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>@{row.influencer.username}</span>
                      </div>
                    </td>

                    {/* PIC */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {row.submittedBy.name || row.submittedBy.email}
                    </td>

                    {/* Country */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.influencer.country || "—"}
                    </td>

                    {/* Platform */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.influencer.platform || "—"}
                    </td>

                    {/* Followers */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                      {formatFollowers(row.influencer.followers)}
                    </td>

                    {/* Videos per Bundle */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap font-mono">
                      {row.videosPerBundle ?? "—"}
                    </td>

                    {/* Currency */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.currency}
                    </td>

                    {/* $/Video */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                      {row.ratePerVideo != null ? `$${row.ratePerVideo.toLocaleString()}` : "—"}
                    </td>

                    {/* Total Local */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                      {row.totalPriceLocal != null
                        ? `${row.currency} ${row.totalPriceLocal.toLocaleString()}`
                        : "—"}
                    </td>

                    {/* Total USD */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-mono text-xs">
                      {row.totalPriceUsd != null
                        ? `$${row.totalPriceUsd.toLocaleString()}`
                        : "—"}
                    </td>

                    {/* PIC Feedback */}
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="truncate text-xs text-muted-foreground">
                        {row.picFeedback || "—"}
                      </p>
                    </td>

                    {/* Profile Link */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {(row.profileLink || row.influencer.profileUrl) ? (
                        <a
                          href={row.profileLink || row.influencer.profileUrl || "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Link
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* CEO Feedback */}
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <p className="truncate text-xs text-muted-foreground">
                        {row.ceoFeedback || "—"}
                      </p>
                    </td>

                    {/* Feedback Status */}
                    <td className="px-3 py-2.5 text-center">
                      {feedbackStatusBadge(row.feedbackStatus)}
                    </td>

                    {/* Contract Status */}
                    <td className="px-3 py-2.5 text-center">
                      {contractStatusBadge(row.contractStatus)}
                    </td>

                    {/* Approval Status */}
                    <td className="px-3 py-2.5 text-center">
                      {statusBadge(row.status)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {!isAdmin &&
                        row.status === "COUNTER_OFFERED" &&
                        hasWrite && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openResubmit(row);
                            }}
                          >
                            Re-submit
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        isAdmin={isAdmin}
      />
    </div>
  );
}
