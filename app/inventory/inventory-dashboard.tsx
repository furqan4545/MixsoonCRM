"use client";

import { Fragment as React_Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
// Alias `Fragment` so JSX `<React.Fragment>` resolves without importing the
// whole React default export.
const React = { Fragment: React_Fragment };
import { useRouter, useSearchParams } from "next/navigation";
import {
  Package,
  Plus,
  Upload,
  Search,
  Pencil,
  Trash2,
  Send,
  AlertTriangle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProductShipment {
  id: string;
  status: string;
  quantity?: number;
  influencer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  quantity: number;
  reserved: number;
  unitCost: number | null;
  createdAt: string;
  _count: { shipments: number; variants?: number };
  shipments: ProductShipment[];
  variants?: Variant[];
}

interface Variant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  reserved: number;
  unitCost: number | null;
}

interface Influencer {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarProxied?: string | null;
  campaignIds?: string[];
}

interface Campaign {
  id: string;
  name: string;
  _count?: { influencers: number };
}

export function InventoryDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);

  // Variants (loaded when the edit dialog opens for an existing product)
  const [variants, setVariants] = useState<Variant[]>([]);
  const [newVariant, setNewVariant] = useState({ name: "", sku: "", quantity: "0" });
  const [variantBusy, setVariantBusy] = useState(false);
  // Per-row expanded state for the inventory list — clicking the row toggles.
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [assigningProduct, setAssigningProduct] = useState<Product | null>(null);
  const [removingShipments, setRemovingShipments] = useState<ProductShipment[] | null>(null);
  const [removeConfirmStep, setRemoveConfirmStep] = useState(0); // 0=initial, 1=confirmed once

  // Add/Edit form
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    description: "",
    category: "",
    quantity: "0",
    unitCost: "",
  });

  // Loading states
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Assign
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assignData, setAssignData] = useState({
    influencerId: "",
    campaignId: "",
    carrier: "DHL",
    quantity: "1",
    notes: "",
    variantId: "",
  });
  const [assignVariants, setAssignVariants] = useState<Variant[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("page", page.toString());
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      setCategories(data.categories || []);
    } catch {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const [influencerSearch, setInfluencerSearch] = useState("");

  // Fetch influencers + campaigns for assign dialog
  useEffect(() => {
    if (showAssignDialog) {
      fetch("/api/influencers?limit=2000&minimal=true")
        .then((r) => r.json())
        .then((d) => {
          const list = d.influencers || d || [];
          setInfluencers(list);
        })
        .catch(() => {});
      fetch("/api/marketing-campaigns")
        .then((r) => r.json())
        .then((d) => setCampaigns(d || []))
        .catch(() => {});
    }
  }, [showAssignDialog]);

  const filteredProducts = useMemo(() => products, [products]);

  // Add/Edit product
  const handleSaveProduct = async () => {
    setSaving(true);
    const method = editingProduct ? "PATCH" : "POST";
    const url = editingProduct
      ? `/api/inventory/${editingProduct.id}`
      : "/api/inventory";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save product");
        return;
      }
      // On create, flush any buffered draft variants. Sequential POSTs so we
      // can surface per-variant errors (e.g. duplicate SKU) cleanly.
      let createdId: string | null = null;
      if (!editingProduct) {
        try {
          const data = await res.clone().json();
          createdId = data?.id ?? data?.product?.id ?? null;
        } catch {
          createdId = null;
        }
        const drafts = variants.filter((v) => v.id.startsWith("draft-"));
        if (createdId && drafts.length > 0) {
          for (const v of drafts) {
            const vr = await fetch(`/api/inventory/${createdId}/variants`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: v.name,
                sku: v.sku,
                quantity: v.quantity,
              }),
            });
            if (!vr.ok) {
              const err = await vr.json().catch(() => ({}));
              toast.error(`Variant "${v.name}" failed: ${err.error || "unknown"}`);
            }
          }
        }
      }
      toast.success(editingProduct ? "Product updated" : "Product created");
      setShowAddDialog(false);
      setEditingProduct(null);
      setFormData({ name: "", sku: "", description: "", category: "", quantity: "0", unitCost: "" });
      setVariants([]);
      setNewVariant({ name: "", sku: "", quantity: "0" });
      fetchProducts();
    } catch {
      toast.error("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  // Delete product
  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}" (${product.sku})?`)) return;
    setDeleting(product.id);
    try {
      const res = await fetch(`/api/inventory/${product.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to delete");
        return;
      }
      toast.success("Product deleted");
      fetchProducts();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  // Import CSV
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/inventory/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import failed");
        return;
      }
      toast.success(
        `Imported: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped`,
      );
      setShowImportDialog(false);
      fetchProducts();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Assign product to influencer
  const handleAssign = async () => {
    if (!assigningProduct || !assignData.influencerId) {
      toast.error("Select an influencer");
      return;
    }
    setAssigning(true);
    const qty = Math.max(1, parseInt(assignData.quantity) || 1);
    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: assigningProduct.id,
          variantId: assignData.variantId || undefined,
          influencerId: assignData.influencerId,
          campaignId: assignData.campaignId || undefined,
          carrier: assignData.carrier,
          quantity: qty,
          notes: assignData.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to assign");
        return;
      }
      toast.success(`${qty} unit${qty > 1 ? "s" : ""} assigned`);
      setShowAssignDialog(false);
      setAssigningProduct(null);
      setAssignData({ influencerId: "", campaignId: "", carrier: "DHL", quantity: "1", notes: "", variantId: "" });
      setAssignVariants([]);
      fetchProducts();
    } catch {
      toast.error("Failed to assign product");
    } finally {
      setAssigning(false);
    }
  };

  const loadVariants = useCallback(async (productId: string) => {
    try {
      const res = await fetch(`/api/inventory/${productId}/variants`);
      if (!res.ok) return;
      const data = await res.json();
      setVariants(data.variants ?? []);
    } catch {
      setVariants([]);
    }
  }, []);

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      description: product.description || "",
      category: product.category || "",
      quantity: product.quantity.toString(),
      unitCost: product.unitCost?.toString() || "",
    });
    setVariants([]);
    setNewVariant({ name: "", sku: "", quantity: "0" });
    loadVariants(product.id);
    setShowAddDialog(true);
  };

  const openAdd = () => {
    setEditingProduct(null);
    setFormData({ name: "", sku: "", description: "", category: "", quantity: "0", unitCost: "" });
    setVariants([]);
    setNewVariant({ name: "", sku: "", quantity: "0" });
    setShowAddDialog(true);
  };

  const handleAddVariant = async () => {
    if (variantBusy) return;
    const name = newVariant.name.trim();
    const sku = newVariant.sku.trim();
    if (!name || !sku) return;
    const qty = Math.max(0, Number(newVariant.quantity) || 0);

    // No product yet — buffer the variant locally; we'll POST each one after
    // the product is created in handleSaveProduct. Drafts use a synthetic id
    // prefix so handleDeleteVariant can tell them apart from persisted rows.
    if (!editingProduct) {
      setVariants((prev) => [
        ...prev,
        {
          id: `draft-${Date.now()}-${prev.length}`,
          productId: "",
          name,
          sku,
          imageUrl: null,
          quantity: qty,
          reserved: 0,
          unitCost: null,
        },
      ]);
      setNewVariant({ name: "", sku: "", quantity: "0" });
      return;
    }

    setVariantBusy(true);
    try {
      const res = await fetch(`/api/inventory/${editingProduct.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sku, quantity: qty }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to add variant");
        return;
      }
      const data = await res.json();
      setVariants((prev) => [...prev, data.variant]);
      setNewVariant({ name: "", sku: "", quantity: "0" });
    } finally {
      setVariantBusy(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    // Local-only draft (not yet persisted) — just drop from state.
    if (variantId.startsWith("draft-")) {
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
      return;
    }
    if (!editingProduct) return;
    try {
      const res = await fetch(
        `/api/inventory/${editingProduct.id}/variants/${variantId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to delete variant");
        return;
      }
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
    } catch {
      toast.error("Failed to delete variant");
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-sm text-muted-foreground">
              {total} product{total !== 1 ? "s" : ""} in stock
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Product Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-center p-3 font-medium">Stock</th>
                <th className="text-center p-3 font-medium">Shipped</th>
                <th className="text-left p-3 font-medium">Assigned To</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No products found
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const available = product.quantity - product.reserved;
                  const variantCount =
                    product._count.variants ?? product.variants?.length ?? 0;
                  const isExpanded = expandedProductId === product.id;
                  return (
                    <React.Fragment key={product.id}>
                    <tr className={`border-t hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""}`}>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedProductId(isExpanded ? null : product.id)
                          }
                          className="flex items-center gap-3 text-left w-full group"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-10 w-10 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium truncate group-hover:underline">
                                {product.name}
                              </p>
                              {variantCount > 0 && (
                                <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium px-1.5 py-0.5">
                                  {variantCount} variant{variantCount !== 1 ? "s" : ""}
                                </span>
                              )}
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                            </div>
                            {product.unitCost && (
                              <p className="text-xs text-muted-foreground">
                                ${product.unitCost.toFixed(2)}/unit
                              </p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="p-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {product.sku}
                        </code>
                      </td>
                      <td className="p-3">
                        {product.category ? (
                          <Badge variant="secondary">{product.category}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={available <= 0 ? "text-red-600 font-semibold" : ""}>
                          {product.quantity}
                        </span>
                        {available <= 0 && (
                          <Badge variant="destructive" className="ml-1 text-[10px]">
                            Out
                          </Badge>
                        )}
                        {available > 0 && available < 5 && (
                          <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" title="Low stock" />
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {product.reserved > 0 ? product.reserved : "—"}
                      </td>
                      <td className="p-3">
                        {product.shipments.length > 0 ? (() => {
                          // Group shipments by influencer
                          const grouped = new Map<string, { influencer: ProductShipment["influencer"]; shipments: ProductShipment[] }>();
                          for (const s of product.shipments) {
                            const existing = grouped.get(s.influencer.id);
                            if (existing) {
                              existing.shipments.push(s);
                            } else {
                              grouped.set(s.influencer.id, { influencer: s.influencer, shipments: [s] });
                            }
                          }
                          const entries = [...grouped.values()];
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {entries.slice(0, 5).map(({ influencer: inf, shipments: infShipments }) => {
                                const avatarSrc = inf.avatarUrl
                                  ? `/api/thumbnail?url=${encodeURIComponent(inf.avatarUrl)}`
                                  : null;
                                const qty = infShipments.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
                                return (
                                  <button
                                    key={inf.id}
                                    type="button"
                                    className="relative group"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRemovingShipments(infShipments);
                                    }}
                                    title={`${inf.displayName || inf.username} — ${qty} unit${qty > 1 ? "s" : ""}`}
                                  >
                                    {avatarSrc ? (
                                      <img
                                        src={avatarSrc}
                                        alt={inf.username}
                                        className="h-8 w-8 rounded-full object-cover border-2 border-gray-200 group-hover:ring-2 group-hover:ring-red-300 transition"
                                      />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-semibold border-2 border-gray-200 bg-muted group-hover:ring-2 group-hover:ring-red-300 transition">
                                        {(inf.displayName || inf.username)?.[0]?.toUpperCase()}
                                      </div>
                                    )}
                                    {qty > 1 && (
                                      <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-foreground text-background text-[9px] font-bold flex items-center justify-center">
                                        {qty}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                              {entries.length > 5 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  +{entries.length - 5}
                                </span>
                              )}
                            </div>
                          );
                        })() : product.reserved > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] text-amber-700"
                            title={`${product.reserved} units reserved but no active shipments returned. The reserved counter may be out of sync — try the Refresh action or check shipment statuses.`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {product.reserved} reserved (no shipments)
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Assign to influencer"
                            onClick={async () => {
                              setAssigningProduct(product);
                              setAssignVariants([]);
                              setAssignData((prev) => ({ ...prev, variantId: "", quantity: "1" }));
                              setShowAssignDialog(true);
                              // Fetch variants — UI shows the picker if any exist.
                              try {
                                const r = await fetch(`/api/inventory/${product.id}/variants`);
                                if (r.ok) {
                                  const d = await r.json();
                                  setAssignVariants(d.variants ?? []);
                                }
                              } catch {}
                            }}
                            disabled={available <= 0}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={7} className="p-4">
                          {variantCount === 0 ? (
                            <div className="text-xs text-muted-foreground italic">
                              No variants. This product uses a single SKU with the
                              quantity shown above. Click the pencil icon to add
                              shades / sizes.
                            </div>
                          ) : !product.variants || product.variants.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Loading variants…
                            </div>
                          ) : (
                            <div className="rounded-md border bg-background overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-medium">Variant</th>
                                    <th className="text-left px-3 py-2 font-medium">SKU</th>
                                    <th className="text-right px-3 py-2 font-medium">Stock</th>
                                    <th className="text-right px-3 py-2 font-medium">Reserved</th>
                                    <th className="text-right px-3 py-2 font-medium">Available</th>
                                    <th className="text-right px-3 py-2 font-medium">Sent</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {product.variants.map((v) => {
                                    const vAvail = v.quantity - v.reserved;
                                    // Count shipments tied to this variant — Sent =
                                    // total units across non-FAILED shipments.
                                    const sentForVariant = (product.shipments ?? [])
                                      .filter((s) => (s as ProductShipment & { variantId?: string | null }).variantId === v.id)
                                      .reduce((sum, s) => sum + (s.quantity ?? 1), 0);
                                    return (
                                      <tr key={v.id} className="border-t">
                                        <td className="px-3 py-2 font-medium">{v.name}</td>
                                        <td className="px-3 py-2">
                                          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
                                            {v.sku}
                                          </code>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          {v.quantity}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">
                                          {v.reserved > 0 ? v.reserved : "—"}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-medium ${vAvail <= 0 ? "text-red-600" : ""}`}>
                                          {vAvail}
                                          {vAvail <= 0 && (
                                            <span className="ml-1 text-[10px] text-red-600">Out</span>
                                          )}
                                          {vAvail > 0 && vAvail < 5 && (
                                            <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">
                                          {sentForVariant > 0 ? sentForVariant : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground self-center">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Add/Edit Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Product name"
                />
              </div>
              <div>
                <Label>SKU *</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Unique code"
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g. Skincare"
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  min="0"
                />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  value={formData.unitCost}
                  onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Variants (shades / sizes). For a new product, drafts buffer
                in memory and POST after the product is created. For an existing
                product, each add/delete hits the API immediately.
                A product with no variants behaves as a single SKU using the
                quantity above; once variants exist, each one has its own stock. */}
            <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Variants / Shades</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {variants.length} variant{variants.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {variants.length > 0 && (
                  <div className="rounded-md border divide-y mb-3">
                    {variants.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{v.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            SKU: {v.sku} · Stock: {v.quantity}
                            {v.reserved > 0 ? ` (${v.reserved} reserved)` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteVariant(v.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete variant"
                          aria-label="Delete variant"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-[1fr_1fr_90px_auto] gap-2 items-end">
                  <Input
                    placeholder="Variant name (e.g. Light)"
                    value={newVariant.name}
                    onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                  />
                  <Input
                    placeholder="SKU"
                    value={newVariant.sku}
                    onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Qty"
                    value={newVariant.quantity}
                    onChange={(e) => setNewVariant({ ...newVariant, quantity: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddVariant}
                    disabled={
                      variantBusy ||
                      !newVariant.name.trim() ||
                      !newVariant.sku.trim()
                    }
                  >
                    {variantBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Each variant gets its own SKU and stock count. Bundles can
                  reference a specific variant.
                  {!editingProduct && variants.length > 0 && (
                    <span className="block mt-0.5 text-amber-700">
                      These {variants.length} variant{variants.length !== 1 ? "s" : ""} will be created when you save the product.
                    </span>
                  )}
                </p>
              </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProduct} disabled={!formData.name || !formData.sku || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                editingProduct ? "Update" : "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Products from CSV/Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file with columns: <strong>name</strong>, <strong>sku</strong>,
              quantity, category, unit cost, description. Existing SKUs will have their quantity added.
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              disabled={importing}
            />
            {importing && (
              <p className="text-sm text-muted-foreground">Importing...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign to Influencer Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={(open) => {
        setShowAssignDialog(open);
        if (!open) {
          setAssigningProduct(null);
          setInfluencerSearch("");
          setAssignData({ influencerId: "", campaignId: "", carrier: "DHL", quantity: "1", notes: "", variantId: "" });
          setAssignVariants([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign Product to Influencer
            </DialogTitle>
          </DialogHeader>
          {assigningProduct && (
            <div className="space-y-4">
              {/* Product info */}
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Package className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{assigningProduct.name}</p>
                  <p className="text-xs text-muted-foreground">
                    SKU: {assigningProduct.sku} — Available:{" "}
                    {assigningProduct.quantity - assigningProduct.reserved}
                  </p>
                </div>
              </div>

              {/* Campaign first — filters influencer list */}
              <div>
                <Label>Campaign (optional — filters influencer list)</Label>
                <Select
                  value={assignData.campaignId || "none"}
                  onValueChange={(v) => {
                    setAssignData({ ...assignData, campaignId: v === "none" ? "" : v, influencerId: "" });
                    setInfluencerSearch("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All influencers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All influencers (no campaign filter)</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c._count?.influencers ? `(${c._count.influencers})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected influencer preview */}
              {assignData.influencerId && (() => {
                const sel = influencers.find((i) => i.id === assignData.influencerId);
                if (!sel) return null;
                return (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      {(sel.avatarProxied || sel.avatarUrl) ? (
                        <img src={sel.avatarProxied || sel.avatarUrl || ""} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center text-sm font-medium text-green-700">
                          {(sel.displayName || sel.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm text-green-900">{sel.displayName || sel.username}</p>
                        <p className="text-xs text-green-700">@{sel.username}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-green-700 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setAssignData({ ...assignData, influencerId: "" })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })()}

              {/* Influencer — searchable list */}
              <div>
                <Label>Influencer {assignData.influencerId ? "" : "*"}</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or username..."
                    value={influencerSearch}
                    onChange={(e) => setInfluencerSearch(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
                <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto">
                  {(() => {
                    // Filter by campaign if selected
                    let filtered = influencers;
                    if (assignData.campaignId) {
                      filtered = influencers.filter(
                        (inf) => inf.campaignIds?.includes(assignData.campaignId)
                      );
                    }
                    // Then filter by search
                    if (influencerSearch) {
                      const q = influencerSearch.toLowerCase();
                      filtered = filtered.filter(
                        (inf) =>
                          inf.username.toLowerCase().includes(q) ||
                          (inf.displayName || "").toLowerCase().includes(q)
                      );
                    }
                    // Limit display
                    const shown = filtered.slice(0, 50);
                    if (shown.length === 0) {
                      return (
                        <p className="p-3 text-xs text-muted-foreground text-center">
                          No influencers found
                        </p>
                      );
                    }
                    return (
                      <>
                        {shown.map((inf) => (
                          <button
                            key={inf.id}
                            type="button"
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 transition ${
                              assignData.influencerId === inf.id ? "bg-primary/10 border-l-2 border-primary" : ""
                            }`}
                            onClick={() => setAssignData({ ...assignData, influencerId: inf.id })}
                          >
                            {(inf.avatarProxied || inf.avatarUrl) ? (
                              <img src={inf.avatarProxied || inf.avatarUrl || ""} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                                {(inf.displayName || inf.username)?.[0]?.toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {inf.displayName || inf.username}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                @{inf.username}
                              </p>
                            </div>
                          </button>
                        ))}
                        {filtered.length > 50 && (
                          <p className="p-2 text-[11px] text-muted-foreground text-center border-t">
                            Showing 50 of {filtered.length} — use search to narrow down
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Variant picker — only if this product has shades/sizes.
                  Selecting a variant switches stock tracking to that variant's
                  own counters (decoupled from the parent product). */}
              {assignVariants.length > 0 && (
                <div>
                  <Label>Variant / Shade</Label>
                  <Select
                    value={assignData.variantId || "none"}
                    onValueChange={(v) =>
                      setAssignData((prev) => ({
                        ...prev,
                        variantId: v === "none" ? "" : v,
                        quantity: "1",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a variant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No variant — use product stock</SelectItem>
                      {assignVariants.map((v) => {
                        const avail = v.quantity - v.reserved;
                        return (
                          <SelectItem key={v.id} value={v.id} disabled={avail <= 0}>
                            {v.name} ({v.sku}) — {avail} available
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity + Carrier */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    max={(() => {
                      if (assignData.variantId) {
                        const v = assignVariants.find((x) => x.id === assignData.variantId);
                        return v ? v.quantity - v.reserved : 1;
                      }
                      return assigningProduct ? assigningProduct.quantity - assigningProduct.reserved : 1;
                    })()}
                    value={assignData.quantity}
                    onChange={(e) => setAssignData({ ...assignData, quantity: e.target.value })}
                  />
                  {assigningProduct && (() => {
                    const max = assignData.variantId
                      ? (assignVariants.find((x) => x.id === assignData.variantId)
                          ? (assignVariants.find((x) => x.id === assignData.variantId)!.quantity -
                              assignVariants.find((x) => x.id === assignData.variantId)!.reserved)
                          : 0)
                      : assigningProduct.quantity - assigningProduct.reserved;
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Max: {max}
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <Label>Carrier</Label>
                  <Select
                    value={assignData.carrier}
                    onValueChange={(v) => setAssignData({ ...assignData, carrier: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DHL">DHL</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="FEDEX">FedEx</SelectItem>
                      <SelectItem value="EMS">EMS</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={assignData.notes}
                  onChange={(e) => setAssignData({ ...assignData, notes: e.target.value })}
                  placeholder="Optional notes"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assignData.influencerId || assigning}>
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign & Create Shipment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Assignment Confirmation Dialog (double confirm) */}
      <Dialog open={!!removingShipments} onOpenChange={(open) => {
        if (!open) {
          setRemovingShipments(null);
          setRemoveConfirmStep(0);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {removeConfirmStep === 0 ? "Remove All Shipments?" : "Are you absolutely sure?"}
            </DialogTitle>
          </DialogHeader>
          {removingShipments && removingShipments.length > 0 && (() => {
            const inf = removingShipments[0].influencer;
            const totalShipments = removingShipments.length;
            const totalUnits = removingShipments.reduce((sum, s) => sum + (s.quantity ?? 1), 0);
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  {inf.avatarUrl ? (
                    <img
                      src={`/api/thumbnail?url=${encodeURIComponent(inf.avatarUrl)}`}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                      {(inf.displayName || inf.username)?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {inf.displayName || inf.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{inf.username} — {totalShipments} shipment{totalShipments > 1 ? "s" : ""}, {totalUnits} unit{totalUnits > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                {removeConfirmStep === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This will cancel all shipments for this influencer and free up {totalUnits} reserved unit{totalUnits > 1 ? "s" : ""}.
                  </p>
                ) : (
                  <p className="text-sm text-red-600 font-medium">
                    This cannot be undone. All {totalShipments} shipment record{totalShipments > 1 ? "s" : ""} will be permanently deleted.
                  </p>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRemovingShipments(null);
              setRemoveConfirmStep(0);
            }}>
              Cancel
            </Button>
            {removeConfirmStep === 0 ? (
              <Button variant="destructive" onClick={() => setRemoveConfirmStep(1)}>
                Yes, Remove All
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={removing}
                onClick={async () => {
                  if (!removingShipments) return;
                  setRemoving(true);
                  try {
                    let failed = 0;
                    await Promise.all(
                      removingShipments.map(async (s) => {
                        const res = await fetch(`/api/shipments/${s.id}`, { method: "DELETE" });
                        if (!res.ok) failed++;
                      })
                    );
                    if (failed > 0) {
                      toast.error(`${failed} shipment(s) failed to remove`);
                    } else {
                      toast.success(`All ${removingShipments.length} shipment(s) removed`);
                    }
                    setRemovingShipments(null);
                    setRemoveConfirmStep(0);
                    fetchProducts();
                  } catch {
                    toast.error("Failed to remove assignments");
                  } finally {
                    setRemoving(false);
                  }
                }}
              >
                {removing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Confirm Delete All"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
