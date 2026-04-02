"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Truck,
  Search,
  Package,
  ExternalLink,
  RefreshCw,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  X,
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

interface Shipment {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; imageUrl: string | null };
  influencer: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  campaign: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  quantity: number;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippingAddress: Record<string, string> | null;
  lastTrackingData: TrackingResult | null;
  lastTrackedAt: string | null;
  notes: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

interface TrackingResult {
  carrier: string;
  trackingNumber: string;
  status: string;
  estimatedDelivery?: string;
  events: { timestamp: string; location: string; description: string; status: string }[];
  trackingUrl: string;
  error?: string;
}

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "RETURNED", label: "Returned" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  SHIPPED: "bg-blue-100 text-blue-700",
  IN_TRANSIT: "bg-amber-100 text-amber-700",
  DELIVERED: "bg-green-100 text-green-700",
  RETURNED: "bg-orange-100 text-orange-700",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-3 w-3" />,
  SHIPPED: <Package className="h-3 w-3" />,
  IN_TRANSIT: <Truck className="h-3 w-3" />,
  DELIVERED: <CheckCircle2 className="h-3 w-3" />,
  RETURNED: <ArrowRight className="h-3 w-3" />,
  FAILED: <XCircle className="h-3 w-3" />,
};

export function ShippingDashboard() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Detail panel
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Edit tracking dialog
  const [showTrackingDialog, setShowTrackingDialog] = useState(false);
  const [trackingForm, setTrackingForm] = useState({
    trackingNumber: "",
    carrier: "DHL",
  });
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", page.toString());
      const res = await fetch(`/api/shipments?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShipments(data.shipments);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // Update status
  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/shipments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status updated to ${status}`);
      fetchShipments();
      if (selectedShipment?.id === id) {
        const updated = await res.json();
        setSelectedShipment((prev) => prev ? { ...prev, ...updated } : null);
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  // Save tracking number
  const saveTracking = async () => {
    if (!editingShipmentId) return;
    try {
      const res = await fetch(`/api/shipments/${editingShipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: trackingForm.trackingNumber,
          carrier: trackingForm.carrier,
          status: "SHIPPED",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tracking number saved");
      setShowTrackingDialog(false);
      fetchShipments();
    } catch {
      toast.error("Failed to save tracking");
    }
  };

  // Refresh tracking from carrier API
  const refreshTracking = async (shipment: Shipment) => {
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/shipments/${shipment.id}/track`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Tracking refresh failed");
        return;
      }
      toast.success(data.cached ? "Showing cached tracking data" : "Tracking updated");
      setSelectedShipment((prev) =>
        prev
          ? {
              ...prev,
              lastTrackingData: data.tracking,
              lastTrackedAt: data.lastTrackedAt,
              ...(data.statusUpdated ? { status: data.statusUpdated } : {}),
            }
          : null,
      );
      fetchShipments();
    } catch {
      toast.error("Failed to refresh tracking");
    } finally {
      setTrackingLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex h-full">
        {/* Main list */}
        <div className={`flex-1 p-6 space-y-6 ${selectedShipment ? "max-w-[60%]" : ""}`}>
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold">Shipping</h1>
            <p className="text-sm text-muted-foreground">
              {total} shipment{total !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Filters */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by influencer, tracking#..."
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

          {/* Shipment List */}
          <div className="space-y-2">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading...</p>
            ) : shipments.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No shipments found</p>
              </div>
            ) : (
              shipments.map((s) => (
                <div
                  key={s.id}
                  className={`border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition ${
                    selectedShipment?.id === s.id ? "border-primary bg-muted/20" : ""
                  }`}
                  onClick={() => setSelectedShipment(s)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {s.influencer.avatarUrl ? (
                        <img
                          src={s.influencer.avatarUrl}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(s.influencer.displayName || s.influencer.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm">
                          {s.influencer.displayName || s.influencer.username}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.product.name} ({s.product.sku}){s.quantity > 1 ? ` x${s.quantity}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.campaign && (
                        <Badge variant="outline" className="text-[10px]">
                          {s.campaign.name}
                        </Badge>
                      )}
                      <Badge className={`${STATUS_COLORS[s.status] || ""} text-[11px] gap-1`}>
                        {STATUS_ICONS[s.status]}
                        {s.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                  {s.trackingNumber && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{s.carrier}</span>
                      <span>#{s.trackingNumber}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedShipment && (
          <div className="w-[40%] border-l bg-background overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Shipment Detail</h2>
                <Button variant="ghost" size="icon" onClick={() => setSelectedShipment(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Status + Actions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className={`${STATUS_COLORS[selectedShipment.status]} gap-1`}>
                    {STATUS_ICONS[selectedShipment.status]}
                    {selectedShipment.status.replace("_", " ")}
                  </Badge>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {selectedShipment.status === "PENDING" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingShipmentId(selectedShipment.id);
                          setTrackingForm({
                            trackingNumber: selectedShipment.trackingNumber || "",
                            carrier: selectedShipment.carrier,
                          });
                          setShowTrackingDialog(true);
                        }}
                      >
                        <Package className="h-3 w-3 mr-1" />
                        Mark as Shipped
                      </Button>
                    </>
                  )}
                  {(selectedShipment.status === "SHIPPED" || selectedShipment.status === "IN_TRANSIT") && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(selectedShipment.id, "DELIVERED")}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Mark Delivered
                    </Button>
                  )}
                  {selectedShipment.trackingNumber && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshTracking(selectedShipment)}
                        disabled={trackingLoading}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${trackingLoading ? "animate-spin" : ""}`} />
                        Refresh Tracking
                      </Button>
                      {selectedShipment.trackingUrl && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={selectedShipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Track on {selectedShipment.carrier}
                          </a>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Product */}
              <div>
                <h3 className="text-sm font-medium mb-2">Product</h3>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{selectedShipment.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      SKU: {selectedShipment.product.sku}
                      {selectedShipment.quantity > 1 ? ` — Qty: ${selectedShipment.quantity}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Influencer */}
              <div>
                <h3 className="text-sm font-medium mb-2">Influencer</h3>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  {selectedShipment.influencer.avatarUrl ? (
                    <img src={selectedShipment.influencer.avatarUrl} className="h-8 w-8 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {(selectedShipment.influencer.displayName || selectedShipment.influencer.username)?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{selectedShipment.influencer.displayName || selectedShipment.influencer.username}</p>
                    <p className="text-xs text-muted-foreground">@{selectedShipment.influencer.username}</p>
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              {selectedShipment.shippingAddress && (
                <div>
                  <h3 className="text-sm font-medium mb-2">
                    <MapPin className="inline h-3 w-3 mr-1" />
                    Shipping Address
                  </h3>
                  <div className="text-sm bg-muted/50 rounded-lg p-3 space-y-0.5">
                    <p>{selectedShipment.shippingAddress.fullName}</p>
                    <p>{selectedShipment.shippingAddress.addressLine1}</p>
                    {selectedShipment.shippingAddress.addressLine2 && (
                      <p>{selectedShipment.shippingAddress.addressLine2}</p>
                    )}
                    <p>
                      {selectedShipment.shippingAddress.city}{" "}
                      {selectedShipment.shippingAddress.postalCode}
                    </p>
                    <p>{selectedShipment.shippingAddress.country}</p>
                  </div>
                </div>
              )}

              {/* Tracking Timeline */}
              {selectedShipment.lastTrackingData && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Tracking Timeline</h3>
                  {selectedShipment.lastTrackingData.error && (
                    <p className="text-xs text-amber-600 mb-2">
                      {selectedShipment.lastTrackingData.error}
                    </p>
                  )}
                  {selectedShipment.lastTrackingData.estimatedDelivery && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Estimated delivery: {selectedShipment.lastTrackingData.estimatedDelivery}
                    </p>
                  )}
                  <div className="space-y-0">
                    {(selectedShipment.lastTrackingData.events || []).map((event, i) => (
                      <div key={i} className="flex gap-3 pb-4 relative">
                        <div className="flex flex-col items-center">
                          <div className={`h-2.5 w-2.5 rounded-full mt-1.5 ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                          {i < (selectedShipment.lastTrackingData?.events?.length ?? 0) - 1 && (
                            <div className="w-px flex-1 bg-muted-foreground/20 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.location && `${event.location} · `}
                            {event.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Created: {new Date(selectedShipment.createdAt).toLocaleDateString()}</p>
                {selectedShipment.shippedAt && (
                  <p>Shipped: {new Date(selectedShipment.shippedAt).toLocaleDateString()}</p>
                )}
                {selectedShipment.deliveredAt && (
                  <p>Delivered: {new Date(selectedShipment.deliveredAt).toLocaleDateString()}</p>
                )}
                {selectedShipment.notes && (
                  <p className="mt-2 text-sm">{selectedShipment.notes}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Enter Tracking Number Dialog */}
      <Dialog open={showTrackingDialog} onOpenChange={setShowTrackingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Tracking Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Carrier</Label>
              <Select
                value={trackingForm.carrier}
                onValueChange={(v) => setTrackingForm({ ...trackingForm, carrier: v })}
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
            <div>
              <Label>Tracking Number</Label>
              <Input
                value={trackingForm.trackingNumber}
                onChange={(e) => setTrackingForm({ ...trackingForm, trackingNumber: e.target.value })}
                placeholder="Enter tracking number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTrackingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveTracking} disabled={!trackingForm.trackingNumber}>
              Save & Mark Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
