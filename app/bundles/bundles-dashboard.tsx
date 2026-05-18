"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Boxes,
  Plus,
  Send,
  Pencil,
  Trash2,
  Loader2,
  Package,
  Search,
  Globe,
  X,
} from "lucide-react";

type Variant = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  reserved: number;
};
type ProductSlim = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  reserved: number;
  imageUrl: string | null;
  variants?: Variant[];
};
type BundleItem = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  product: { id: string; name: string; sku: string; imageUrl: string | null; quantity?: number; reserved?: number };
  variant: { id: string; name: string; sku: string; quantity?: number; reserved?: number } | null;
};
type Bundle = {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  imageUrl: string | null;
  createdAt: string;
  _count: { items: number; shipments: number };
  items: BundleItem[];
  createdBy: { id: string; name: string | null; email: string } | null;
};
type InfluencerSlim = {
  id: string;
  username: string;
  displayName: string | null;
  avatarProxied: string | null;
};

// Local-only item draft used when composing a new/edited bundle. We keep
// productId + variantId here; the API persists them as BundleItem rows.
type DraftItem = {
  key: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  sku: string;
  quantity: number;
};

export function BundlesDashboard() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductSlim[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");

  // Editor dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [form, setForm] = useState<{
    name: string;
    description: string;
    region: string;
    items: DraftItem[];
  }>({ name: "", description: "", region: "", items: [] });
  const [saving, setSaving] = useState(false);

  // Send dialog (multi-select — one bundle can go to N influencers in a batch)
  const [sendOpen, setSendOpen] = useState(false);
  const [sendingBundle, setSendingBundle] = useState<Bundle | null>(null);
  const [influencers, setInfluencers] = useState<InfluencerSlim[]>([]);
  const [influencerSearch, setInfluencerSearch] = useState("");
  const [selectedInfluencerIds, setSelectedInfluencerIds] = useState<Set<string>>(
    new Set(),
  );
  const [sending, setSending] = useState(false);

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (regionFilter) params.set("region", regionFilter);
      const res = await fetch(`/api/bundles?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setBundles(data.bundles ?? []);
    } finally {
      setLoading(false);
    }
  }, [regionFilter]);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/inventory?pageSize=500");
    if (!res.ok) return;
    const data = await res.json();
    const ps: ProductSlim[] = data.products ?? [];
    // Pull variants for each product in parallel — most products have 0
    // variants so this is cheap. We do this once on dashboard mount.
    const withVariants = await Promise.all(
      ps.map(async (p) => {
        try {
          const r = await fetch(`/api/inventory/${p.id}/variants`);
          if (!r.ok) return p;
          const d = await r.json();
          return { ...p, variants: d.variants ?? [] };
        } catch {
          return p;
        }
      }),
    );
    setProducts(withVariants);
  }, []);

  const fetchInfluencers = useCallback(async () => {
    const res = await fetch("/api/influencers?limit=200");
    if (!res.ok) return;
    const data = await res.json();
    setInfluencers(
      (data.influencers ?? []).map((i: { id: string; username: string; displayName: string | null; avatarProxied: string | null }) => ({
        id: i.id,
        username: i.username,
        displayName: i.displayName,
        avatarProxied: i.avatarProxied,
      })),
    );
  }, []);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const regions = useMemo(
    () => Array.from(new Set(bundles.map((b) => b.region).filter(Boolean) as string[])).sort(),
    [bundles],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bundles;
    return bundles.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description ?? "").toLowerCase().includes(q) ||
        (b.region ?? "").toLowerCase().includes(q),
    );
  }, [bundles, search]);

  // ── Editor ────────────────────────────────────────────────
  const openCreate = () => {
    setEditingBundle(null);
    setForm({ name: "", description: "", region: "", items: [] });
    setEditorOpen(true);
  };
  const openEdit = (b: Bundle) => {
    setEditingBundle(b);
    setForm({
      name: b.name,
      description: b.description ?? "",
      region: b.region ?? "",
      items: b.items.map((it) => ({
        key: it.id,
        productId: it.product.id,
        productName: it.product.name,
        variantId: it.variant?.id ?? null,
        variantName: it.variant?.name ?? null,
        sku: it.variant?.sku ?? it.product.sku,
        quantity: it.quantity,
      })),
    });
    setEditorOpen(true);
  };

  const addItemToForm = (
    product: ProductSlim,
    variant: Variant | null,
    quantity: number,
  ) => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: `${product.id}:${variant?.id ?? "_"}:${Date.now()}`,
          productId: product.id,
          productName: product.name,
          variantId: variant?.id ?? null,
          variantName: variant?.name ?? null,
          sku: variant?.sku ?? product.sku,
          quantity,
        },
      ],
    }));
  };
  const removeItemFromForm = (key: string) =>
    setForm((p) => ({ ...p, items: p.items.filter((i) => i.key !== key) }));

  const handleSaveBundle = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        region: form.region.trim() || null,
        items: form.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      };
      const url = editingBundle
        ? `/api/bundles/${editingBundle.id}`
        : "/api/bundles";
      const res = await fetch(url, {
        method: editingBundle ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save");
        return;
      }
      toast.success(editingBundle ? "Bundle updated" : "Bundle created");
      setEditorOpen(false);
      fetchBundles();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBundle = async (b: Bundle) => {
    if (!confirm(`Delete bundle "${b.name}"? This won't remove shipments already sent.`)) return;
    const res = await fetch(`/api/bundles/${b.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Failed to delete");
      return;
    }
    toast.success("Bundle deleted");
    fetchBundles();
  };

  // ── Send dialog ───────────────────────────────────────────
  const openSend = (b: Bundle) => {
    setSendingBundle(b);
    setInfluencerSearch("");
    setSelectedInfluencerIds(new Set());
    setSendOpen(true);
    fetchInfluencers();
  };

  const toggleInfluencer = (id: string) => {
    setSelectedInfluencerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredInfluencers = useMemo(() => {
    const q = influencerSearch.trim().toLowerCase();
    if (!q) return influencers.slice(0, 50);
    return influencers
      .filter(
        (i) =>
          i.username.toLowerCase().includes(q) ||
          (i.displayName ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [influencers, influencerSearch]);

  const handleSendBundle = async () => {
    if (!sendingBundle || selectedInfluencerIds.size === 0 || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/bundles/${sendingBundle.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds: [...selectedInfluencerIds] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to send bundle");
        return;
      }
      const data = await res.json();
      toast.success(
        `Bundle sent to ${data.influencerCount} influencer${data.influencerCount !== 1 ? "s" : ""}`,
        {
          description: `${data.shipmentCount} shipment${data.shipmentCount !== 1 ? "s" : ""} created in total`,
        },
      );
      setSendOpen(false);
      fetchBundles();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bundles</h1>
            <p className="text-sm text-muted-foreground">
              {bundles.length} bundle{bundles.length !== 1 ? "s" : ""} — reusable
              product sets you can send to influencers in one click.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Bundle
          </Button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bundles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {regions.length > 0 && (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading bundles…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No bundles yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first bundle (e.g. "US Welcome Bundle") to send the
              same set of products to many influencers in one click.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Bundle
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border bg-background hover:border-foreground/20 transition-colors flex flex-col"
              >
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-base font-semibold truncate flex-1">
                      {b.name}
                    </h3>
                    {b.region && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700 shrink-0">
                        <Globe className="h-2.5 w-2.5" />
                        {b.region}
                      </span>
                    )}
                  </div>
                  {b.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                      {b.description}
                    </p>
                  )}
                  <div className="space-y-1 mt-2">
                    {b.items.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No items yet
                      </p>
                    ) : (
                      b.items.slice(0, 5).map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {it.product.name}
                            {it.variant ? (
                              <span className="text-muted-foreground"> — {it.variant.name}</span>
                            ) : null}
                          </span>
                          <span className="text-muted-foreground ml-auto shrink-0">
                            ×{it.quantity}
                          </span>
                        </div>
                      ))
                    )}
                    {b.items.length > 5 && (
                      <p className="text-[11px] text-muted-foreground">
                        +{b.items.length - 5} more
                      </p>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-3">
                    {b._count.shipments} shipment
                    {b._count.shipments !== 1 ? "s" : ""} sent
                  </div>
                </div>
                <div className="flex items-center gap-1 border-t px-2 py-2 bg-muted/10">
                  <Button
                    size="sm"
                    onClick={() => openSend(b)}
                    disabled={b.items.length === 0}
                    title={
                      b.items.length === 0
                        ? "Add items before sending"
                        : "Send to influencer"
                    }
                  >
                    <Send className="h-3 w-3 mr-1.5" />
                    Send
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(b)}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteBundle(b)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bundle editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBundle ? "Edit Bundle" : "New Bundle"}
            </DialogTitle>
            <DialogDescription>
              Group products + shades together. Sending the bundle creates one
              shipment per item.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. US Welcome Bundle"
                />
              </div>
              <div>
                <Label>Region (optional)</Label>
                <Input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  placeholder="e.g. US, UK, KR"
                />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                placeholder="What's in this bundle and when do you send it?"
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Items</Label>
                <span className="text-[11px] text-muted-foreground">
                  {form.items.length} item
                  {form.items.length !== 1 ? "s" : ""}
                </span>
              </div>
              {form.items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1 py-2">
                  No items yet. Pick a product below to add one.
                </p>
              ) : (
                <div className="rounded-md border bg-background divide-y">
                  {form.items.map((i) => (
                    <div
                      key={i.key}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">
                        {i.productName}
                        {i.variantName && (
                          <span className="text-muted-foreground"> — {i.variantName}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          ({i.sku})
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">×{i.quantity}</span>
                      <button
                        onClick={() => removeItemFromForm(i.key)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <AddItemRow products={products} onAdd={addItemToForm} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveBundle} disabled={!form.name.trim() || saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : editingBundle ? (
                "Save Changes"
              ) : (
                "Create Bundle"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send-bundle dialog — multi-select. Same bundle, many influencers
          in one transaction. Stock is checked across the whole batch first;
          if anyone's short, nothing is sent. */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send "{sendingBundle?.name}"</DialogTitle>
            <DialogDescription>
              Pick one or more influencers. We'll create{" "}
              {sendingBundle?.items.length ?? 0} shipment
              {(sendingBundle?.items.length ?? 0) !== 1 ? "s" : ""} per
              influencer ({selectedInfluencerIds.size}{" "}
              {selectedInfluencerIds.size === 1 ? "selected" : "selected"}) —
              stock is reserved atomically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Influencers</Label>
              <Input
                value={influencerSearch}
                onChange={(e) => setInfluencerSearch(e.target.value)}
                placeholder="Search by handle or display name"
                className="mt-1"
              />
            </div>

            {/* Select-all / clear controls (operate on the currently-visible
                filtered list, so search lets the user grab a region quickly). */}
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const next = new Set(selectedInfluencerIds);
                  for (const i of filteredInfluencers) next.add(i.id);
                  setSelectedInfluencerIds(next);
                }}
                className="text-foreground underline hover:no-underline"
                disabled={filteredInfluencers.length === 0}
              >
                Select all {filteredInfluencers.length > 0 ? `(${filteredInfluencers.length})` : ""}
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setSelectedInfluencerIds(new Set())}
                className="text-muted-foreground hover:text-foreground"
                disabled={selectedInfluencerIds.size === 0}
              >
                Clear
              </button>
              <span className="ml-auto text-muted-foreground">
                {selectedInfluencerIds.size} selected
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border divide-y bg-background">
              {filteredInfluencers.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">
                  {influencers.length === 0 ? "Loading…" : "No matches"}
                </p>
              ) : (
                filteredInfluencers.map((i) => {
                  const checked = selectedInfluencerIds.has(i.id);
                  return (
                    <label
                      key={i.id}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent ${
                        checked ? "bg-accent/70" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInfluencer(i.id)}
                        className="rounded shrink-0"
                      />
                      {i.avatarProxied ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={i.avatarProxied}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {i.displayName || `@${i.username}`}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          @{i.username}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendBundle}
              disabled={selectedInfluencerIds.size === 0 || sending}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-3 w-3 mr-2" />
                  Send to {selectedInfluencerIds.size || ""}{" "}
                  influencer{selectedInfluencerIds.size === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Small composer row inside the editor — pick product, optionally a variant,
// set quantity, click +.
function AddItemRow({
  products,
  onAdd,
}: {
  products: ProductSlim[];
  onAdd: (product: ProductSlim, variant: Variant | null, quantity: number) => void;
}) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");

  const product = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const variant = useMemo(
    () => product?.variants?.find((v) => v.id === variantId) ?? null,
    [product, variantId],
  );

  const handleAdd = () => {
    if (!product) return;
    const quantity = Math.max(1, Number(qty) || 1);
    onAdd(product, variant, quantity);
    setQty("1");
    setVariantId("");
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_70px_auto] gap-2 items-end pt-1">
      <div>
        <span className="text-[10px] font-medium text-muted-foreground">
          Product
        </span>
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setVariantId("");
          }}
          className="mt-0.5 flex h-9 w-full rounded-md border bg-background px-2 text-xs"
        >
          <option value="">Choose…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="text-[10px] font-medium text-muted-foreground">
          Shade / variant
        </span>
        <select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          disabled={!product?.variants?.length}
          className="mt-0.5 flex h-9 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-50"
        >
          <option value="">
            {product?.variants?.length ? "No variant" : "—"}
          </option>
          {product?.variants?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.sku})
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="text-[10px] font-medium text-muted-foreground">
          Qty
        </span>
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleAdd}
        disabled={!productId}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
