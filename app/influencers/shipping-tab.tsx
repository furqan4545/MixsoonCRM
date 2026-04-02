"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Package,
  Truck,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Shipment {
  id: string;
  product: { id: string; name: string; sku: string; imageUrl: string | null };
  campaign: { id: string; name: string } | null;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippingAddress: Record<string, string> | null;
  lastTrackingData: {
    events?: { timestamp: string; location: string; description: string }[];
    error?: string;
  } | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

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

export default function ShippingTab({ influencerId }: { influencerId: string }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const fetchShipments = useCallback(async () => {
    try {
      const res = await fetch(`/api/shipments?influencerId=${influencerId}&pageSize=100`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShipments(data.shipments || []);
    } catch {
      toast.error("Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }, [influencerId]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const refreshTracking = async (shipmentId: string) => {
    setRefreshingId(shipmentId);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/track`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Tracking updated");
      fetchShipments();
    } catch {
      toast.error("Failed to refresh tracking");
    } finally {
      setRefreshingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading shipments...</p>;
  }

  if (shipments.length === 0) {
    return (
      <div className="text-center py-8">
        <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No shipments for this influencer</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Assigned Products & Shipments ({shipments.length})
      </h3>

      {shipments.map((s) => (
        <div key={s.id} className="border rounded-lg p-4 space-y-3">
          {/* Product + Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {s.product.imageUrl ? (
                <img src={s.product.imageUrl} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium text-sm">{s.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU: {s.product.sku}
                  {s.campaign && ` · ${s.campaign.name}`}
                </p>
              </div>
            </div>
            <Badge className={`${STATUS_COLORS[s.status] || ""} gap-1 text-[11px]`}>
              {STATUS_ICONS[s.status]}
              {s.status.replace("_", " ")}
            </Badge>
          </div>

          {/* Tracking */}
          {s.trackingNumber && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{s.carrier} #{s.trackingNumber}</span>
              <div className="flex gap-1">
                {s.trackingUrl && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" asChild>
                    <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Track
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => refreshTracking(s.id)}
                  disabled={refreshingId === s.id}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${refreshingId === s.id ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          )}

          {/* Latest tracking event */}
          {s.lastTrackingData?.events?.[0] && (
            <div className="bg-muted/50 rounded p-2 text-xs">
              <p className="font-medium">{s.lastTrackingData.events[0].description}</p>
              <p className="text-muted-foreground">
                {s.lastTrackingData.events[0].location && `${s.lastTrackingData.events[0].location} · `}
                {s.lastTrackingData.events[0].timestamp}
              </p>
            </div>
          )}

          {/* Dates */}
          <div className="flex gap-4 text-[11px] text-muted-foreground">
            <span>Created: {new Date(s.createdAt).toLocaleDateString()}</span>
            {s.shippedAt && <span>Shipped: {new Date(s.shippedAt).toLocaleDateString()}</span>}
            {s.deliveredAt && <span>Delivered: {new Date(s.deliveredAt).toLocaleDateString()}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
