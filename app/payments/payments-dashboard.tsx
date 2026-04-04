"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  Plus,
  Search,
  Send,
  Bell,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowRight,
  XCircle,
  CreditCard,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── TYPES ────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  bankName: string | null;
  accountNumberMasked: string;
  accountHolder: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  influencer: { id: string; username: string; displayName: string | null; avatarUrl: string | null; email: string | null };
  campaign: { id: string; name: string } | null;
  createdBy: { id: string; name: string; email: string } | null;
}

interface Influencer {
  id: string;
  username: string;
  displayName: string | null;
  avatarProxied?: string | null;
}

interface Campaign { id: string; name: string }
interface UserRow { id: string; name: string | null; email: string }

// ─── HELPERS ──────────────────────────────────────────────

function fmtAmount(n: number, currency: string): string {
  if (currency === "KRW") return `₩${n.toLocaleString()}`;
  if (currency === "USD") return `$${n.toLocaleString()}`;
  return `${n.toLocaleString()} ${currency}`;
}

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SENT", label: "Sent" },
  { value: "RECEIVED", label: "Received" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  PROCESSING: <ArrowRight className="h-3 w-3" />,
  SENT: <Send className="h-3 w-3" />,
  RECEIVED: <CheckCircle2 className="h-3 w-3" />,
  FAILED: <XCircle className="h-3 w-3" />,
};

// ─── COMPONENT ────────────────────────────────────────────

export function PaymentsDashboard() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Detail panel
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [infSearch, setInfSearch] = useState("");
  const [createData, setCreateData] = useState({ influencerId: "", campaignId: "", amount: "", currency: "KRW", invoiceNumber: "", notes: "" });

  // Notify dialog
  const [showNotify, setShowNotify] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [notifyMessage, setNotifyMessage] = useState("");

  // Request details
  const [requesting, setRequesting] = useState(false);

  const fetchingRef = useRef(false);

  const fetchPayments = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", page.toString());
      const res = await fetch(`/api/payments?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments);
        setTotal(data.total);
      }
    } catch {
      toast.error("Failed to load payments");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Fetch influencers + campaigns for create dialog
  useEffect(() => {
    if (showCreate) {
      fetch("/api/influencers?limit=2000&minimal=true").then((r) => r.json()).then((d) => setInfluencers(d.influencers || [])).catch(() => {});
      fetch("/api/marketing-campaigns").then((r) => r.json()).then((d) => setCampaigns(d || [])).catch(() => {});
    }
  }, [showCreate]);

  // Fetch users for notify dialog
  useEffect(() => {
    if (showNotify) {
      fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users || d || [])).catch(() => {});
    }
  }, [showNotify]);

  const filteredInf = useMemo(() => {
    if (!infSearch) return influencers.slice(0, 50);
    const q = infSearch.toLowerCase();
    return influencers.filter((i) => i.username.toLowerCase().includes(q) || (i.displayName || "").toLowerCase().includes(q)).slice(0, 50);
  }, [influencers, infSearch]);

  // Create payment
  const handleCreate = async () => {
    if (!createData.influencerId || !createData.amount) return;
    setCreating(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createData),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create payment");
        return;
      }
      toast.success("Payment created");
      setShowCreate(false);
      setCreateData({ influencerId: "", campaignId: "", amount: "", currency: "KRW", invoiceNumber: "", notes: "" });
      fetchPayments();
    } catch {
      toast.error("Failed to create payment");
    } finally {
      setCreating(false);
    }
  };

  // Update status
  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      toast.success(`Status updated to ${status}`);
      setSelected((prev) => prev?.id === id ? { ...prev, ...updated } : prev);
      fetchPayments();
    } catch {
      toast.error("Failed to update");
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    try {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to delete");
        return;
      }
      toast.success("Payment deleted");
      setSelected(null);
      fetchPayments();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Notify users
  const handleNotify = async () => {
    if (!selected || selectedUserIds.size === 0) return;
    setNotifying(true);
    try {
      const res = await fetch(`/api/payments/${selected.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [...selectedUserIds], message: notifyMessage || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to notify");
        return;
      }
      const data = await res.json();
      toast.success(`Notified ${data.notifiedCount} user(s)`);
      setShowNotify(false);
      setSelectedUserIds(new Set());
      setNotifyMessage("");
    } catch {
      toast.error("Failed to notify");
    } finally {
      setNotifying(false);
    }
  };

  // Request payment details from influencer
  const requestDetails = async (influencerId: string) => {
    setRequesting(true);
    try {
      const res = await fetch("/api/payments/request-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to send request");
        if (data.link) toast.info(`Manual link: ${data.link}`);
        return;
      }
      toast.success("Payment details request sent to influencer");
    } catch {
      toast.error("Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  const totalPages = Math.ceil(total / 50);
  const pendingCount = payments.filter((p) => p.status === "PENDING").length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex h-full">
        {/* Main list */}
        <div className={`flex-1 p-6 space-y-6 overflow-auto ${selected ? "max-w-[60%]" : ""}`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Payments</h1>
              <p className="text-sm text-muted-foreground">
                {total} payment{total !== 1 ? "s" : ""}
                {pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Payment
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by influencer, bank, invoice..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  variant={statusFilter === tab.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => { setStatusFilter(tab.value); setPage(1); }}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Payment List */}
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : payments.length === 0 ? (
            <div className="text-center py-12">
              <Banknote className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No payments found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className={`border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition ${selected?.id === p.id ? "border-primary bg-muted/20" : ""}`}
                  onClick={() => setSelected(p)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {p.influencer.avatarUrl ? (
                        <img src={`/api/thumbnail?url=${encodeURIComponent(p.influencer.avatarUrl)}`} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(p.influencer.displayName || p.influencer.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {p.influencer.displayName || p.influencer.username}
                          <span className="text-muted-foreground font-normal ml-1">@{p.influencer.username}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.bankName && `${p.bankName} ${p.accountNumberMasked}`}
                          {p.campaign && ` · ${p.campaign.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{fmtAmount(p.amount, p.currency)}</span>
                      <Badge className={`${STATUS_COLORS[p.status] || ""} text-[11px] gap-1`}>
                        {STATUS_ICONS[p.status]}
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground self-center">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="w-[40%] border-l bg-background overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Payment Detail</h2>
                <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Amount + Status */}
              <div className="text-center py-4 bg-muted/50 rounded-lg">
                <p className="text-3xl font-bold">{fmtAmount(selected.amount, selected.currency)}</p>
                <Badge className={`${STATUS_COLORS[selected.status]} mt-2 gap-1`}>
                  {STATUS_ICONS[selected.status]}
                  {selected.status}
                </Badge>
              </div>

              {/* Status actions */}
              <div className="flex gap-2 flex-wrap">
                {selected.status === "PENDING" && (
                  <Button size="sm" onClick={() => updateStatus(selected.id, "PROCESSING")}>
                    <ArrowRight className="h-3 w-3 mr-1" />Mark Processing
                  </Button>
                )}
                {selected.status === "PROCESSING" && (
                  <Button size="sm" onClick={() => updateStatus(selected.id, "SENT")}>
                    <Send className="h-3 w-3 mr-1" />Mark Sent
                  </Button>
                )}
                {selected.status === "SENT" && (
                  <Button size="sm" onClick={() => updateStatus(selected.id, "RECEIVED")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" />Mark Received
                  </Button>
                )}
                {selected.status !== "RECEIVED" && selected.status !== "FAILED" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(selected.id, "FAILED")}>
                    <XCircle className="h-3 w-3 mr-1" />Mark Failed
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setShowNotify(true)}>
                  <Bell className="h-3 w-3 mr-1" />Notify
                </Button>
                {selected.status === "PENDING" && (
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(selected.id)}>Delete</Button>
                )}
              </div>

              {/* Influencer */}
              <div>
                <h3 className="text-sm font-medium mb-2">Influencer</h3>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  {selected.influencer.avatarUrl ? (
                    <img src={`/api/thumbnail?url=${encodeURIComponent(selected.influencer.avatarUrl)}`} className="h-8 w-8 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {(selected.influencer.displayName || selected.influencer.username)?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{selected.influencer.displayName || selected.influencer.username}</p>
                    <p className="text-xs text-muted-foreground">@{selected.influencer.username}</p>
                  </div>
                  {!selected.bankName && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto text-xs"
                      onClick={() => requestDetails(selected.influencer.id)}
                      disabled={requesting}
                    >
                      {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Request Payment Details"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Bank Details */}
              {selected.bankName && (
                <div>
                  <h3 className="text-sm font-medium mb-2">
                    <Building2 className="inline h-3 w-3 mr-1" />Bank Details
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Bank:</span> {selected.bankName}</p>
                    <p><span className="text-muted-foreground">Account:</span> {selected.accountNumberMasked}</p>
                    <p><span className="text-muted-foreground">Holder:</span> {selected.accountHolder}</p>
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="text-xs text-muted-foreground space-y-1">
                {selected.invoiceNumber && <p>Invoice: {selected.invoiceNumber}</p>}
                {selected.campaign && <p>Campaign: {selected.campaign.name}</p>}
                <p>Created: {new Date(selected.createdAt).toLocaleDateString()}</p>
                {selected.paidAt && <p>Sent: {new Date(selected.paidAt).toLocaleDateString()}</p>}
                {selected.confirmedAt && <p>Received: {new Date(selected.confirmedAt).toLocaleDateString()}</p>}
                {selected.createdBy && <p>Created by: {selected.createdBy.name || selected.createdBy.email}</p>}
                {selected.notes && <p className="mt-2 text-sm text-foreground">{selected.notes}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Payment Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) { setCreateData({ influencerId: "", campaignId: "", amount: "", currency: "KRW", invoiceNumber: "", notes: "" }); setInfSearch(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Influencer selector */}
            {createData.influencerId && (() => {
              const sel = influencers.find((i) => i.id === createData.influencerId);
              if (!sel) return null;
              return (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                      {(sel.displayName || sel.username)?.[0]?.toUpperCase()}
                    </div>
                    <p className="text-sm font-medium text-green-900">{sel.displayName || sel.username}</p>
                  </div>
                  <button onClick={() => setCreateData({ ...createData, influencerId: "" })} className="text-green-700 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
            {!createData.influencerId && (
              <div>
                <Label>Influencer *</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search influencer..." value={infSearch} onChange={(e) => setInfSearch(e.target.value)} className="pl-9 text-sm" />
                </div>
                <div className="mt-1 border rounded-lg max-h-36 overflow-y-auto">
                  {filteredInf.map((inf) => (
                    <button key={inf.id} type="button" className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => setCreateData({ ...createData, influencerId: inf.id })}>
                      <span className="font-medium truncate">{inf.displayName || inf.username}</span>
                      <span className="text-[11px] text-muted-foreground">@{inf.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount *</Label>
                <Input type="number" value={createData.amount} onChange={(e) => setCreateData({ ...createData, amount: e.target.value })} placeholder="0" />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={createData.currency} onValueChange={(v) => setCreateData({ ...createData, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KRW">KRW (₩)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Campaign (optional)</Label>
              <Select value={createData.campaignId || "none"} onValueChange={(v) => setCreateData({ ...createData, campaignId: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="No campaign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Invoice # (optional)</Label>
              <Input value={createData.invoiceNumber} onChange={(e) => setCreateData({ ...createData, invoiceNumber: e.target.value })} placeholder="INV-001" />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={createData.notes} onChange={(e) => setCreateData({ ...createData, notes: e.target.value })} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!createData.influencerId || !createData.amount || creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notify Users Dialog */}
      <Dialog open={showNotify} onOpenChange={(open) => {
        setShowNotify(open);
        if (!open) { setSelectedUserIds(new Set()); setNotifyMessage(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Notify Users</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Select users to email about this payment.</p>
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(u.id)}
                    onChange={(e) => {
                      const next = new Set(selectedUserIds);
                      e.target.checked ? next.add(u.id) : next.delete(u.id);
                      setSelectedUserIds(next);
                    }}
                    className="rounded"
                  />
                  <div>
                    <p className="text-sm font-medium">{u.name || u.email}</p>
                    <p className="text-[11px] text-muted-foreground">{u.email}</p>
                  </div>
                </label>
              ))}
            </div>
            <div>
              <Label>Message (optional)</Label>
              <Textarea value={notifyMessage} onChange={(e) => setNotifyMessage(e.target.value)} placeholder="Additional context..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotify(false)}>Cancel</Button>
            <Button onClick={handleNotify} disabled={selectedUserIds.size === 0 || notifying}>
              {notifying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : `Notify ${selectedUserIds.size} User${selectedUserIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
