"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ContractRow {
  id: string;
  status: string;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  influencer: { id: string; username: string; displayName: string | null };
  campaign: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
}

const STATUS_OPTIONS = ["ALL", "DRAFT", "SENT", "SIGNED", "ACTIVE", "COMPLETED"] as const;

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SENT: "bg-blue-100 text-blue-700 border-blue-200",
  SIGNED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  COMPLETED: "bg-purple-100 text-purple-700 border-purple-200",
};

export function ContractsPage({ contracts: initial }: { contracts: ContractRow[] }) {
  const router = useRouter();
  const [contracts] = useState(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortNewest, setSortNewest] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    let list = contracts;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.influencer.username.toLowerCase().includes(q) ||
          (c.influencer.displayName ?? "").toLowerCase().includes(q) ||
          (c.template?.name ?? "Contract").toLowerCase().includes(q) ||
          (c.campaign?.name ?? "").toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter !== "ALL") {
      list = list.filter((c) => c.status === statusFilter);
    }

    // Sort
    const sorted = [...list].sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sortNewest ? db - da : da - db;
    });

    return sorted;
  }, [contracts, search, statusFilter, sortNewest]);

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    // Small delay so spinner is visible
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {contracts.length} contract{contracts.length !== 1 ? "s" : ""} total
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
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by influencer, contract name, campaign..."
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

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

        {/* Sort toggle */}
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
            {search || statusFilter !== "ALL" ? "No contracts match your filters." : "No contracts yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-lg border p-4 space-y-2.5 hover:border-foreground/20 transition-colors">
              {/* Row 1: Name + influencer + status */}
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
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusColors[c.status] || ""}`}
                >
                  {c.status}
                </span>
              </div>

              {/* Row 2: Meta info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {c.campaign && <span>Campaign: {c.campaign.name}</span>}
                <span>Created {new Date(c.createdAt).toLocaleDateString()}</span>
                {c.signedAt && (
                  <span className="text-emerald-600 font-medium">
                    Signed {new Date(c.signedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Row 3: Actions */}
              <div className="flex items-center gap-2">
                {c.status === "SENT" && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    Awaiting signature
                  </span>
                )}
                {c.signedPdfUrl && (
                  <>
                    <a
                      href={`/api/contracts/pdf-url?contractId=${c.id}&type=signed`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <Eye className="mr-1 h-3 w-3" />
                        View Signed
                      </Button>
                    </a>
                    <a
                      href={`/api/contracts/pdf-url?contractId=${c.id}&type=signed`}
                      download={`contract-${c.id}-signed.pdf`}
                    >
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <Download className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                    </a>
                  </>
                )}
                <Link
                  href={`/influencers?selected=${c.influencer.id}&tab=contracts`}
                  className="ml-auto"
                >
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    Open in Influencer
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
