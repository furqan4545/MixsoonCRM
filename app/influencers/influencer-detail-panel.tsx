"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  Mail,
  Globe,
  Plus,
  X,
  Eye,
  Bookmark,
  Calendar,
  ExternalLink,
  Megaphone,
  ChevronDown,
  ChevronRight,
  Send,
  Inbox,
  Loader2,
  Check,
  FileText,
  ClipboardCheck,
  Download,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThumbnailImage } from "@/components/thumbnail-image";
import type { InfluencerRow } from "./influencers-dashboard";
import { InfluencerContactSection } from "@/components/influencer-contact-section";
import { toast } from "sonner";

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function getInitials(name: string | null, username: string): string {
  if (name) {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return username.substring(0, 2).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-amber-700 text-amber-50",
    "bg-emerald-700 text-emerald-50",
    "bg-sky-700 text-sky-50",
    "bg-violet-700 text-violet-50",
    "bg-rose-700 text-rose-50",
    "bg-teal-700 text-teal-50",
    "bg-orange-700 text-orange-50",
    "bg-indigo-700 text-indigo-50",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const PIPELINE_STAGES = [
  { key: "PROSPECT", label: "Prospect", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { key: "OUTREACH", label: "Outreach", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { key: "NEGOTIATING", label: "Negotiating", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "CONTRACTED", label: "Contracted", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "COMPLETED", label: "Completed", color: "bg-blue-100 text-blue-700 border-blue-200" },
] as const;

function getActivityDotColor(type: string): string {
  switch (type) {
    case "ai_score":
      return "bg-emerald-600";
    case "pipeline_change":
      return "bg-blue-600";
    case "email_extracted":
      return "bg-purple-600";
    case "tag_added":
      return "bg-amber-600";
    case "note_added":
      return "bg-teal-600";
    case "campaign_assigned":
      return "bg-rose-600";
    default:
      return "bg-gray-400";
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
}

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ── Stage dropdown ── */
function StageDropdown({
  currentStage,
  onSelect,
  saving,
}: {
  currentStage: string;
  onSelect: (stage: string) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const current = PIPELINE_STAGES.find((s) => s.key === currentStage) ?? PIPELINE_STAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 ${current.color}`}
      >
        {current.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border bg-card shadow-lg py-1">
          {PIPELINE_STAGES.map((stage) => (
            <button
              key={stage.key}
              onClick={() => {
                if (stage.key !== currentStage) onSelect(stage.key);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stage.color}`}
              >
                {stage.label}
              </span>
              {stage.key === currentStage && (
                <Check className="ml-auto h-3 w-3 text-emerald-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Email item type ── */
interface EmailItem {
  id: string;
  from: string;
  to: string[];
  subject: string;
  preview: string;
  bodyHtml: string | null;
  bodyText: string | null;
  folder: string;
  isRead: boolean;
  date: string;
  threadId: string | null;
  isSent: boolean;
}

/* ── Conversations tab content (lazy loaded) ── */
function ConversationsTab({ influencerId, email }: { influencerId: string; email: string | null }) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchEmails = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/influencers/${influencerId}/emails?page=${p}&pageSize=15`
        );
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setEmails(data.items);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPage(data.page);
      } catch {
        toast.error("Failed to load emails");
      } finally {
        setLoading(false);
      }
    },
    [influencerId]
  );

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchEmails(1);
    }
  }, [fetchEmails]);

  if (loading && emails.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && emails.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Mail className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">No conversations yet.</p>
        {email && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <a
              href={`/email/compose?to=${encodeURIComponent(email)}&influencerId=${influencerId}`}
            >
              <Mail className="mr-2 h-3.5 w-3.5" />
              Send Email
            </a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {total} email{total !== 1 ? "s" : ""}
        </p>
        {email && (
          <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <a
              href={`/email/compose?to=${encodeURIComponent(email)}&influencerId=${influencerId}`}
            >
              <Send className="h-3 w-3" />
              Compose
            </a>
          </Button>
        )}
      </div>

      {/* Email list */}
      <div className="space-y-1.5">
        {emails.map((em) => {
          const isExpanded = expandedId === em.id;
          return (
            <div
              key={em.id}
              className="rounded-lg border bg-background overflow-hidden transition-shadow hover:shadow-sm"
            >
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : em.id)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
              >
                {/* Direction icon */}
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    em.isSent
                      ? "bg-blue-100 text-blue-600"
                      : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {em.isSent ? (
                    <Send className="h-3 w-3" />
                  ) : (
                    <Inbox className="h-3 w-3" />
                  )}
                </div>
                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">
                      {em.subject || "(no subject)"}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatEmailDate(em.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {em.isSent ? `To: ${em.to.join(", ")}` : `From: ${em.from}`}
                  </p>
                  {!isExpanded && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                      {em.preview}
                    </p>
                  )}
                </div>
                {/* Expand chevron */}
                <ChevronRight
                  className={`mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                />
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div className="border-t px-3 py-3">
                  <div className="mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>From: {em.from}</span>
                    <span>To: {em.to.join(", ")}</span>
                  </div>
                  {em.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none text-xs [&_*]:!text-xs [&_p]:my-1 [&_br]:leading-tight overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: em.bodyHtml }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">
                      {em.bodyText || "No content"}
                    </p>
                  )}
                  {/* Reply link */}
                  {email && (
                    <div className="mt-3 pt-2 border-t">
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                        <a
                          href={`/email/compose?to=${encodeURIComponent(
                            em.isSent ? em.to[0] : em.from
                          )}&influencerId=${influencerId}&subject=${encodeURIComponent(
                            em.subject.startsWith("Re:") ? em.subject : `Re: ${em.subject}`
                          )}`}
                        >
                          <Mail className="h-3 w-3" />
                          Reply
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={page <= 1 || loading}
            onClick={() => fetchEmails(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={page >= totalPages || loading}
            onClick={() => fetchEmails(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Contracts tab ── */
interface ContractItem {
  id: string;
  status: string;
  rate: number | null;
  currency: string;
  deliverables: string | null;
  requireBankDetails: boolean;
  requireShippingAddress: boolean;
  signedAt: string | null;
  signedPdfUrl: string | null;
  filledContent: string | null;
  pdfUrl: string | null;
  fields: ContractField_JSON[] | null;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
}

type ContractField_JSON = {
  id: string;
  type: "signature" | "date" | "name";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function ContractsTab({
  influencerId,
  influencerName,
  email,
  campaignAssignments,
}: {
  influencerId: string;
  influencerName: string;
  email: string | null;
  campaignAssignments: { campaignId: string; campaignName: string }[];
}) {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [contractRate, setContractRate] = useState("");
  const [contractCurrency, setContractCurrency] = useState("USD");
  const [requireBank, setRequireBank] = useState(false);
  const [requireShipping, setRequireShipping] = useState(false);
  const [saving, setSaving] = useState(false);

  // PDF mode state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fields, setFields] = useState<ContractField_JSON[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const fetchContracts = useCallback(async () => {
    try {
      const res = await fetch(`/api/contracts?influencerId=${influencerId}`);
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts);
      }
    } catch {}
    setLoading(false);
  }, [influencerId]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchContracts();
    }
  }, [fetchContracts]);

  const resetEditor = () => {
    setEditingContractId(null);
    setSelectedCampaign("");
    setContractRate("");
    setContractCurrency("USD");
    setRequireBank(false);
    setRequireShipping(false);
    setPdfUrl(null);
    setPdfSignedUrl(null);
    setPageCount(0);
    setFields([]);
  };

  const openNewContract = () => {
    resetEditor();
    setShowEditor(true);
  };

  const openEditContract = async (contract: ContractItem) => {
    resetEditor();
    setEditingContractId(contract.id);
    setSelectedCampaign(contract.campaign?.id || "");
    setContractRate(contract.rate?.toString() || "");
    setContractCurrency(contract.currency);
    setRequireBank(contract.requireBankDetails);
    setRequireShipping(contract.requireShippingAddress);

    if (contract.pdfUrl) {
      setPdfUrl(contract.pdfUrl);
      setFields((contract.fields as ContractField_JSON[]) || []);
      // Fetch signed URL for rendering
      try {
        const res = await fetch(`/api/contracts/pdf-url?contractId=${contract.id}`);
        if (res.ok) {
          const data = await res.json();
          setPdfSignedUrl(data.url);
        }
      } catch {}
    }
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    resetEditor();
  };

  // Upload PDF/DOCX file
  const handleFileUpload = async (file: File) => {
    setUploadingPdf(true);
    try {
      // If no contract yet, create one first to get an ID
      let cId = editingContractId;
      if (!cId) {
        const createRes = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            influencerId,
            campaignId: selectedCampaign || undefined,
            rate: contractRate || undefined,
            currency: contractCurrency,
            requireBankDetails: requireBank,
            requireShippingAddress: requireShipping,
          }),
        });
        if (!createRes.ok) throw new Error("Failed to create contract");
        const createData = await createRes.json();
        cId = createData.contract.id;
        setEditingContractId(cId);
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("contractId", cId!);

      const res = await fetch("/api/contracts/upload-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload");
      }

      const data = await res.json();
      setPdfUrl(data.pdfUrl);
      setPageCount(data.pageCount);
      setFields([]);

      // Get signed URL for rendering
      const urlRes = await fetch(`/api/contracts/pdf-url?contractId=${cId}`);
      if (urlRes.ok) {
        const urlData = await urlRes.json();
        setPdfSignedUrl(urlData.url);
      }

      toast.success(`PDF uploaded — ${data.pageCount} page${data.pageCount !== 1 ? "s" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingPdf(false);
    }
  };

  const saveContract = async () => {
    if (!pdfUrl) {
      toast.error("Please upload a document first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${editingContractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          rate: contractRate || null,
          currency: contractCurrency,
          requireBankDetails: requireBank,
          requireShippingAddress: requireShipping,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Contract saved");
      closeEditor();
      fetchedRef.current = false;
      fetchContracts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sendForSignature = async (contractId: string) => {
    if (!email) {
      toast.error("Influencer has no email. Add an email first.");
      return;
    }
    setSendingId(contractId);
    try {
      const res = await fetch("/api/onboarding/generate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId, type: "CONTRACT", contractId }),
      });
      if (!res.ok) throw new Error("Failed to generate signing link");
      const data = await res.json();
      const signingUrl = data.url as string;

      const subject = "[MIXSOON] Contract for Signature";
      const body = `Hi ${influencerName},\n\nWe've prepared a contract for your review and signature.\n\nPlease click the link below to review the contract details and sign it electronically:\n\n${signingUrl}\n\nThis link expires in 30 days. If you have any questions, feel free to reply to this email.\n\nBest,\nMIXSOON Team`;

      const params = new URLSearchParams({
        to: email,
        subject,
        body,
        influencerId,
      });
      router.push(`/email/compose?${params.toString()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate signing link");
    } finally {
      setSendingId(null);
    }
  };

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
    SENT: "bg-blue-100 text-blue-700 border-blue-200",
    SIGNED: "bg-emerald-100 text-emerald-700 border-emerald-200",
    ACTIVE: "bg-green-100 text-green-700 border-green-200",
    COMPLETED: "bg-purple-100 text-purple-700 border-purple-200",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showEditor ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {editingContractId && pdfUrl ? "Edit Contract" : "New Contract"}
            </h3>
            <button onClick={closeEditor} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Campaign (optional) */}
          {!editingContractId && campaignAssignments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Campaign (optional)</label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {campaignAssignments.map((ca) => (
                  <option key={ca.campaignId} value={ca.campaignId}>{ca.campaignName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Rate + Currency */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Rate</label>
              <input
                type="number"
                value={contractRate}
                onChange={(e) => setContractRate(e.target.value)}
                placeholder="e.g., 500"
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Currency</label>
              <select
                value={contractCurrency}
                onChange={(e) => setContractCurrency(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Requirement checkboxes */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Request from influencer when signing:
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requireBank}
                onChange={(e) => setRequireBank(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-xs font-medium">Bank Details</span>
              <span className="text-[10px] text-muted-foreground">(account number, holder name)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requireShipping}
                onChange={(e) => setRequireShipping(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-xs font-medium">Shipping Address</span>
              <span className="text-[10px] text-muted-foreground">(for sending products)</span>
            </label>
          </div>

          {/* Upload zone OR PDF field editor */}
          {!pdfSignedUrl ? (
            <div
              className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-foreground/30 transition-colors"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,.docx";
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (file) handleFileUpload(file);
                };
                input.click();
              }}
            >
              {uploadingPdf ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploading & converting...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload Contract Document</p>
                  <p className="text-xs text-muted-foreground">
                    Drag & drop a <strong>.docx</strong> or <strong>.pdf</strong> file, or click to browse
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-muted-foreground">
                  Place signature, date, and name fields on the document:
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    setPdfUrl(null);
                    setPdfSignedUrl(null);
                    setFields([]);
                    setPageCount(0);
                  }}
                >
                  Replace file
                </Button>
              </div>
              <PdfFieldEditorLazy
                pdfUrl={pdfSignedUrl}
                pageCount={pageCount}
                fields={fields}
                onFieldsChange={setFields}
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={saveContract} disabled={saving || !pdfUrl} size="sm" className="text-xs">
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
              Save Draft
            </Button>
            <Button variant="outline" onClick={closeEditor} size="sm" className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={openNewContract} variant="outline" size="sm" className="w-full text-xs">
          <Plus className="mr-1 h-3 w-3" />
          New Contract
        </Button>
      )}

      {/* Contract list */}
      {contracts.length === 0 && !showEditor ? (
        <div className="text-center py-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No contracts yet.</p>
        </div>
      ) : (
        contracts.map((c) => (
          <div key={c.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {c.template?.name || "Contract"}
                </span>
                {c.pdfUrl && (
                  <span className="inline-flex items-center rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
                    PDF
                  </span>
                )}
              </div>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColors[c.status] || ""}`}>
                {c.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {c.rate && <span>{c.currency} {c.rate.toLocaleString()}</span>}
              {c.campaign && <span>{c.campaign.name}</span>}
              <span>{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            {(c.requireBankDetails || c.requireShippingAddress) && (
              <div className="flex items-center gap-1.5">
                {c.requireBankDetails && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    Bank Details
                  </span>
                )}
                {c.requireShippingAddress && (
                  <span className="inline-flex items-center rounded-full bg-violet-50 border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    Shipping
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              {c.status === "DRAFT" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openEditContract(c)}
                  >
                    <Edit2 className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => sendForSignature(c.id)}
                    disabled={sendingId === c.id}
                  >
                    {sendingId === c.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Mail className="mr-1 h-3 w-3" />
                    )}
                    {email ? "Email for Signature" : "Send for Signature"}
                  </Button>
                </>
              )}
              {c.status === "SENT" && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Awaiting signature
                </span>
              )}
              {c.signedPdfUrl && (
                <a href={c.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    <Download className="mr-1 h-3 w-3" />
                    Download PDF
                  </Button>
                </a>
              )}
              {c.signedAt && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <ClipboardCheck className="h-3 w-3" />
                  Signed {new Date(c.signedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Lazy-loaded components ── */
import dynamic from "next/dynamic";

const PdfFieldEditorLazy = dynamic(
  () => import("@/components/pdf-field-editor").then((m) => m.PdfFieldEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-8 rounded-md border border-dashed">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

/* ── Main panel ── */
interface Props {
  influencer: InfluencerRow;
  onClose: () => void;
}

export function InfluencerDetailPanel({ influencer, onClose }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(influencer.notes ?? "");
  const [tags, setTags] = useState<string[]>(influencer.tags);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStage, setCurrentStage] = useState(influencer.pipelineStage);
  const [activeTab, setActiveTab] = useState("overview");

  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.key === currentStage);

  const totalViews = influencer.videos.reduce((sum, v) => sum + (v.views ?? 0), 0);
  const totalBookmarks = influencer.videos.reduce((sum, v) => sum + (v.bookmarks ?? 0), 0);
  const avgViews = influencer.videos.length > 0 ? Math.round(totalViews / influencer.videos.length) : 0;

  const saveField = useCallback(
    async (field: string, value: unknown) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/influencers/${influencer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error("Failed to save");
        toast.success("Saved");
        router.refresh();
      } catch {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [influencer.id, router]
  );

  const handleStageChange = useCallback(
    (stage: string) => {
      setCurrentStage(stage);
      saveField("pipelineStage", stage);
    },
    [saveField]
  );

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      const updated = [...tags, tag];
      setTags(updated);
      saveField("tags", updated);
    }
    setNewTag("");
    setShowTagInput(false);
  };

  const handleRemoveTag = (tag: string) => {
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    saveField("tags", updated);
  };

  return (
    <div className="w-[480px] shrink-0 border-l bg-card overflow-y-auto h-full">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </Button>
          {influencer.email && (
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <a href={`/email/compose?to=${encodeURIComponent(influencer.email)}&influencerId=${influencer.id}`}>
                <Mail className="h-4 w-4" />
              </a>
            </Button>
          )}
          {influencer.profileUrl && (
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <a href={influencer.profileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Profile header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start gap-4">
          {influencer.avatarProxied ? (
            <ThumbnailImage
              src={influencer.avatarProxied}
              alt={influencer.username}
              className="h-16 w-16 shrink-0 rounded-full object-cover border-2 border-border"
              fallbackText={getInitials(influencer.displayName, influencer.username)}
            />
          ) : (
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold ${getAvatarColor(influencer.username)}`}
            >
              {getInitials(influencer.displayName, influencer.username)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold truncate">
                {influencer.displayName ?? influencer.username}
              </h2>
              {influencer.aiScore != null && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-600 bg-emerald-50 text-[10px] font-bold text-emerald-700">
                  {influencer.aiScore}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              @{influencer.username}
              {influencer.platform ? ` · ${influencer.platform}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StageDropdown
                currentStage={currentStage}
                onSelect={handleStageChange}
                saving={saving}
              />
              {influencer.country && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="h-3 w-3" />
                  {influencer.country}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-4 divide-x rounded-lg border bg-background">
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Followers
            </p>
            <p className="mt-0.5 text-lg font-bold">{formatNumber(influencer.followers)}</p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Engagement
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {influencer.engagementRate != null ? `${influencer.engagementRate}%` : "—"}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rate
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {influencer.rate != null ? `$${influencer.rate.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="px-3 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Conversations
            </p>
            <p className="mt-0.5 text-lg font-bold">{influencer.conversationCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
        <TabsList className="w-full justify-start border-b bg-transparent p-0 h-auto rounded-none overflow-x-auto overflow-y-hidden flex-nowrap" style={{ scrollbarWidth: "none" }}>
          <TabsTrigger
            value="overview"
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="videos"
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Videos ({influencer.videos.length})
          </TabsTrigger>
          <TabsTrigger
            value="conversations"
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Conversations
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Notes
          </TabsTrigger>
          <TabsTrigger
            value="contracts"
            className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Contracts
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-0 pt-5 space-y-6 pb-8">
          {/* Contact Information */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact Information
            </h3>
            <InfluencerContactSection
              influencerId={influencer.id}
              email={influencer.email}
              phone={influencer.phone}
              bioLinkUrl={influencer.bioLinkUrl}
              socialLinksJson={influencer.socialLinks}
              onEmailChange={(newEmail) => saveField("email", newEmail)}
            />
            {influencer.biolink && (
              <div className="mt-2 rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Bio</p>
                <p className="text-sm whitespace-pre-line">{influencer.biolink}</p>
              </div>
            )}
            <div className="mt-2 space-y-0 rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm text-muted-foreground">Platform</span>
                <span className="text-sm font-medium">{influencer.platform ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Country</span>
                <span className="text-sm font-medium">{influencer.country ?? "—"}</span>
              </div>
            </div>
          </section>

          {/* Tags */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tags
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                >
                  <span className="text-emerald-500">◇</span>
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 text-emerald-400 hover:text-emerald-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {showTagInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTag();
                      if (e.key === "Escape") {
                        setShowTagInput(false);
                        setNewTag("");
                      }
                    }}
                    autoFocus
                    placeholder="Tag name..."
                    className="h-7 w-24 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              )}
            </div>
          </section>

          {/* Campaign Assignments */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Campaigns
            </h3>
            {influencer.campaignAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not assigned to any campaigns.
              </p>
            ) : (
              <div className="space-y-2">
                {influencer.campaignAssignments.map((ca) => {
                  const statusColors: Record<string, string> = {
                    PLANNING: "bg-blue-100 text-blue-800 border-blue-200",
                    ACTIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
                    PAUSED: "bg-amber-100 text-amber-800 border-amber-200",
                    COMPLETED: "bg-gray-100 text-gray-700 border-gray-200",
                  };
                  const statusLabels: Record<string, string> = {
                    PLANNING: "Planning",
                    ACTIVE: "Active",
                    PAUSED: "Paused",
                    COMPLETED: "Completed",
                  };
                  return (
                    <Link
                      key={ca.campaignId}
                      href={`/campaigns?selected=${ca.campaignId}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{ca.campaignName}</span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusColors[ca.campaignStatus] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
                      >
                        {statusLabels[ca.campaignStatus] ?? ca.campaignStatus}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Pipeline Progress */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline Progress
            </h3>
            <div>
              <div className="flex gap-1 mb-2">
                {PIPELINE_STAGES.map((stage, i) => (
                  <div
                    key={stage.key}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= stageIndex ? "bg-foreground" : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <div className="flex justify-between">
                {PIPELINE_STAGES.map((stage, i) => (
                  <button
                    key={stage.key}
                    onClick={() => handleStageChange(stage.key)}
                    className={`text-[10px] transition-colors hover:text-foreground ${
                      i <= stageIndex
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Video Stats Summary */}
          {influencer.videos.length > 0 && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Video Stats
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Videos</p>
                  <p className="mt-0.5 text-base font-bold">{influencer.videos.length}</p>
                </div>
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Views</p>
                  <p className="mt-0.5 text-base font-bold">{formatNumber(avgViews)}</p>
                </div>
                <div className="rounded-lg border bg-background p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Saves</p>
                  <p className="mt-0.5 text-base font-bold">{formatNumber(totalBookmarks)}</p>
                </div>
              </div>
            </section>
          )}

          {/* Notes */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (influencer.notes ?? "")) {
                  saveField("notes", notes || null);
                }
              }}
              placeholder="Add internal notes..."
              rows={3}
              className="w-full rounded-lg bg-amber-50/80 border-amber-200/50 border p-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </section>

          {/* Activity Timeline */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity Timeline
            </h3>
            {influencer.activityLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-4">
                {influencer.activityLogs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${getActivityDotColor(log.type)}`} />
                      <div className="w-px flex-1 bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{log.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(log.createdAt)}
                        </span>
                      </div>
                      {log.detail && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{log.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* Videos tab */}
        <TabsContent value="videos" className="mt-0 pt-5 pb-8">
          {influencer.videos.length === 0 ? (
            <div className="rounded-xl border bg-background px-6 py-12 text-center text-sm text-muted-foreground">
              No videos scraped for this influencer.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {influencer.videos.map((video) => (
                <div
                  key={video.id}
                  className="group overflow-hidden rounded-xl border bg-background transition-shadow hover:shadow-md"
                >
                  <div className="relative aspect-9/16 overflow-hidden bg-muted">
                    {video.thumbnailProxied ? (
                      <ThumbnailImage
                        src={video.thumbnailProxied}
                        alt={video.title ?? "Video thumbnail"}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No thumbnail
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-xs font-medium leading-tight">
                      {video.title ?? "Untitled"}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {video.views != null && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Eye className="h-2.5 w-2.5" />
                          <span>{formatNumber(video.views)} views</span>
                        </div>
                      )}
                      {video.bookmarks != null && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Bookmark className="h-2.5 w-2.5" />
                          <span>{formatNumber(video.bookmarks)} saves</span>
                        </div>
                      )}
                      {video.uploadedAt && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>{new Date(video.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Conversations tab — lazy loaded */}
        <TabsContent value="conversations" className="mt-0 pt-5 pb-8">
          {activeTab === "conversations" && (
            <ConversationsTab
              influencerId={influencer.id}
              email={influencer.email}
            />
          )}
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes" className="mt-0 pt-5 pb-8">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (influencer.notes ?? "")) {
                saveField("notes", notes || null);
              }
            }}
            placeholder="Add internal notes about this influencer..."
            rows={10}
            className="w-full rounded-lg bg-amber-50/80 border-amber-200/50 border p-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </TabsContent>

        {/* Contracts tab */}
        <TabsContent value="contracts" className="mt-0 pt-5 pb-8">
          {activeTab === "contracts" && (
            <ContractsTab
              influencerId={influencer.id}
              influencerName={influencer.displayName ?? influencer.username}
              email={influencer.email}
              campaignAssignments={influencer.campaignAssignments}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
