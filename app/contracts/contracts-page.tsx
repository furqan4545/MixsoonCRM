"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Mail,
  PenLine,
  Phone,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const SignaturePadLazy = dynamic(
  () => import("@/components/signature-pad").then((m) => m.SignaturePad),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div> },
);

interface ContractRow {
  id: string;
  status: string;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  signedAt: string | null;
  adminSignatureUrl: string | null;
  adminSignedAt: string | null;
  adminSignedBy: { id: string; name: string | null; email: string } | null;
  createdAt: string;
  updatedAt: string;
  influencer: { id: string; username: string; displayName: string | null };
  campaign: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
}

interface SubmissionRow {
  id: string;
  videoLinks: string[];
  notes: string | null;
  sCode: string | null;
  submissionLabel: string | null;
  includePayment: boolean;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  bankCode: string | null;
  status: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  influencer: { id: string; username: string; displayName: string | null };
}

type DocItem =
  | { kind: "contract"; data: ContractRow }
  | { kind: "submission"; data: SubmissionRow };

const STATUS_OPTIONS = [
  "ALL",
  "DRAFT",
  "SENT",
  "SIGNED",
  "ACTIVE",
  "COMPLETED",
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
] as const;

const TYPE_OPTIONS = ["ALL", "CONTRACT", "CONTENT", "PAYMENT"] as const;

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SENT: "bg-blue-100 text-blue-700 border-blue-200",
  SIGNED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  COMPLETED: "bg-purple-100 text-purple-700 border-purple-200",
  PENDING: "bg-gray-100 text-gray-700 border-gray-200",
  SUBMITTED: "bg-amber-100 text-amber-700 border-amber-200",
  VERIFIED: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export function ContractsPage({
  contracts: initialContracts,
  submissions: initialSubmissions,
  isAdmin = false,
}: {
  contracts: ContractRow[];
  submissions: SubmissionRow[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [contracts] = useState(initialContracts);
  const [submissions] = useState(initialSubmissions);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortNewest, setSortNewest] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Admin counter-sign
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signingContractId, setSigningContractId] = useState<string | null>(null);
  const [adminSignature, setAdminSignature] = useState<string | null>(null);
  const [submittingSign, setSubmittingSign] = useState(false);

  const openCounterSign = (contractId: string) => {
    setSigningContractId(contractId);
    setAdminSignature(null);
    setSignDialogOpen(true);
  };

  const submitCounterSign = async () => {
    if (!signingContractId || !adminSignature) return;
    setSubmittingSign(true);
    try {
      const res = await fetch(`/api/contracts/${signingContractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminSignatureUrl: adminSignature }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to counter-sign");
      }
      toast.success("Contract counter-signed successfully");
      setSignDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to counter-sign");
    } finally {
      setSubmittingSign(false);
    }
  };

  const totalCount = contracts.length + submissions.length;

  const filtered = useMemo(() => {
    const items: DocItem[] = [];

    // Add contracts
    if (typeFilter === "ALL" || typeFilter === "CONTRACT") {
      for (const c of contracts) {
        items.push({ kind: "contract", data: c });
      }
    }

    // Add submissions (split by content vs payment)
    if (typeFilter === "ALL" || typeFilter === "CONTENT" || typeFilter === "PAYMENT") {
      for (const s of submissions) {
        const isPayment = s.includePayment && s.videoLinks.length === 0;
        if (typeFilter === "PAYMENT" && !isPayment) continue;
        if (typeFilter === "CONTENT" && isPayment) continue;
        items.push({ kind: "submission", data: s });
      }
    }

    let list = items;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => {
        const inf = item.data.influencer;
        if (
          inf.username.toLowerCase().includes(q) ||
          (inf.displayName ?? "").toLowerCase().includes(q)
        )
          return true;
        if (item.kind === "contract") {
          const c = item.data as ContractRow;
          if ((c.template?.name ?? "").toLowerCase().includes(q)) return true;
          if ((c.campaign?.name ?? "").toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((item) => item.data.status === statusFilter);
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      const da = new Date(a.data.createdAt).getTime();
      const db = new Date(b.data.createdAt).getTime();
      return sortNewest ? db - da : da - db;
    });

    return sorted;
  }, [contracts, submissions, search, statusFilter, typeFilter, sortNewest]);

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  const verifySubmission = async (submissionId: string) => {
    setVerifyingId(submissionId);
    try {
      const res = await fetch(`/api/content-submissions/${submissionId}/verify`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to verify");
      toast.success("Content verified");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to verify");
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount} document{totalCount !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by influencer, name, campaign..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t === "ALL" ? "All Types" : t === "CONTRACT" ? "Contracts" : t === "CONTENT" ? "Content Submissions" : "Payment Forms"}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "ALL" ? "All Statuses" : s}
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortNewest((v) => !v)}
          className="text-sm"
        >
          {sortNewest ? (
            <ArrowDownAZ className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <ArrowUpAZ className="mr-1.5 h-3.5 w-3.5" />
          )}
          {sortNewest ? "Newest" : "Oldest"}
        </Button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {search || statusFilter !== "ALL" || typeFilter !== "ALL"
              ? "No documents match your filters."
              : "No documents yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            if (item.kind === "contract") {
              const c = item.data as ContractRow;
              return (
                <div key={`c-${c.id}`} className="rounded-lg border p-4 space-y-2.5 hover:border-foreground/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">
                        {c.template?.name || "Contract"}
                      </span>
                      {c.pdfUrl && (
                        <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
                          PDF
                        </span>
                      )}
                      <Link
                        href={`/influencers?selected=${c.influencer.id}`}
                        className="inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                      >
                        @{c.influencer.username}
                      </Link>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusColors[c.status] || ""}`}>
                      {c.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {c.campaign && <span>Campaign: {c.campaign.name}</span>}
                    <span>Created {new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.signedAt && (
                      <span className="text-emerald-600 font-medium">
                        Signed {new Date(c.signedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {c.status === "SENT" && (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Awaiting signature
                      </span>
                    )}
                    {c.signedPdfUrl && (
                      <>
                        <a href={`/api/contracts/pdf-url?contractId=${c.id}&type=signed`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Eye className="mr-1 h-3 w-3" />
                            View Signed
                          </Button>
                        </a>
                        <a href={`/api/contracts/pdf-url?contractId=${c.id}&type=signed`} download={`contract-${c.id}-signed.pdf`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <Download className="mr-1 h-3 w-3" />
                            Download
                          </Button>
                        </a>
                      </>
                    )}
                    {/* Admin counter-sign button — show when influencer signed but admin hasn't */}
                    {isAdmin && c.status === "SIGNED" && c.signedAt && !c.adminSignedAt && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openCounterSign(c.id)}
                      >
                        <PenLine className="mr-1 h-3 w-3" />
                        Counter-sign
                      </Button>
                    )}
                    {c.adminSignedAt && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Admin signed {c.adminSignedBy?.name || ""}
                      </span>
                    )}
                    <Link href={`/influencers?selected=${c.influencer.id}&tab=contracts`} className="ml-auto">
                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                        Open in Influencer
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            }

            // Content Submission
            const s = item.data as SubmissionRow;
            const isExpanded = expandedId === s.id;
            return (
              <div key={`s-${s.id}`} className="rounded-lg border hover:border-foreground/20 transition-colors">
                {/* Clickable header */}
                <button
                  type="button"
                  className="w-full p-4 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ClipboardCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {s.submissionLabel
                        ? s.submissionLabel
                        : s.videoLinks.length > 0 ? "Content Submission" : "Payment Form"}
                    </span>
                    {s.sCode && (
                      <span className="inline-flex items-center rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">
                        S-Code: {s.sCode}
                      </span>
                    )}
                    {s.includePayment && s.videoLinks.length > 0 && (
                      <span className="inline-flex items-center rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">
                        + Payment
                      </span>
                    )}
                    <Link
                      href={`/influencers?selected=${s.influencer.id}`}
                      className="inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      @{s.influencer.username}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusColors[s.status] || ""}`}>
                      {s.status}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <span>Created {new Date(s.createdAt).toLocaleDateString()}</span>
                  {s.submittedAt && (
                    <span>Submitted {new Date(s.submittedAt).toLocaleDateString()}</span>
                  )}
                  {s.verifiedAt && (
                    <span className="text-emerald-600 font-medium">
                      Verified {new Date(s.verifiedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t pt-3">
                    {/* Video links */}
                    {s.videoLinks.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Submitted Videos</p>
                        <div className="space-y-1">
                          {s.videoLinks.map((link, i) => (
                            <a
                              key={i}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-blue-600 hover:underline truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bank / Payment Details */}
                    {s.includePayment && (
                      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> Payment Details
                        </p>
                        {s.bankName ? (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                            <div><span className="text-muted-foreground">Bank / Method:</span><br /><span className="font-medium">{s.bankName}</span></div>
                            <div><span className="text-muted-foreground">Account Holder:</span><br /><span className="font-medium">{s.accountHolder || "—"}</span></div>
                            {s.bankCode && (
                              <div><span className="text-muted-foreground">SWIFT / BIC:</span><br /><span className="font-medium">{s.bankCode}</span></div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600">No payment details submitted yet</p>
                        )}
                      </div>
                    )}

                    {/* S-Code */}
                    {s.sCode && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">S-Code:</span> <span className="font-medium">{s.sCode}</span>
                      </div>
                    )}

                    {/* Notes */}
                    {s.notes && (
                      <div className="bg-muted/30 rounded p-2.5 text-xs text-muted-foreground">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">Notes:</span>
                        <p className="mt-1 italic">{s.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {s.status === "PENDING" && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Awaiting submission
                        </span>
                      )}
                      {s.status === "SUBMITTED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); verifySubmission(s.id); }}
                          disabled={verifyingId === s.id}
                        >
                          {verifyingId === s.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          Verify
                        </Button>
                      )}
                      {s.verifiedAt && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Verified {new Date(s.verifiedAt).toLocaleDateString()}
                        </span>
                      )}
                      <Link href={`/influencers?selected=${s.influencer.id}&tab=contracts`} className="ml-auto" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs">
                          Open in Influencer
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Counter-sign Dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Counter-sign Contract</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add your signature or stamp to counter-sign this contract on behalf of the company.
          </p>
          <div className="py-4">
            <SignaturePadLazy
              onSignatureChange={(data) => setAdminSignature(data)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)} disabled={submittingSign}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={submitCounterSign}
              disabled={!adminSignature || submittingSign}
            >
              {submittingSign ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PenLine className="mr-1.5 h-3.5 w-3.5" />
              )}
              {submittingSign ? "Signing..." : "Counter-sign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
