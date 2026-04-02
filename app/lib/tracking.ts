/**
 * DHL + UPS tracking integration with fallback URLs.
 * Set DHL_API_KEY, UPS_CLIENT_ID, UPS_CLIENT_SECRET env vars for API tracking.
 * Without API keys, generates clickable tracking URLs as fallback.
 */

import { ShippingCarrier } from "@prisma/client";

export interface TrackingEvent {
  timestamp: string;
  location: string;
  description: string;
  status: string;
}

export interface TrackingResult {
  carrier: string;
  trackingNumber: string;
  status: string; // mapped to ShipmentStatus
  estimatedDelivery?: string;
  events: TrackingEvent[];
  trackingUrl: string;
  rawData?: unknown;
  error?: string;
}

// ─── TRACKING URL GENERATORS ──────────────────────────────

export function generateTrackingUrl(
  carrier: ShippingCarrier,
  trackingNumber: string,
): string {
  switch (carrier) {
    case "DHL":
      return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
    case "FEDEX":
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
    case "EMS":
      return `https://www.ems.post/en/global-network/tracking?q=${encodeURIComponent(trackingNumber)}`;
    default:
      return `https://track.aftership.com/${encodeURIComponent(trackingNumber)}`;
  }
}

// ─── DHL TRACKING ─────────────────────────────────────────

async function trackDHL(trackingNumber: string): Promise<TrackingResult> {
  const apiKey = process.env.DHL_API_KEY;
  const trackingUrl = generateTrackingUrl("DHL", trackingNumber);

  if (!apiKey) {
    return {
      carrier: "DHL",
      trackingNumber,
      status: "UNKNOWN",
      events: [],
      trackingUrl,
      error: "DHL_API_KEY not configured. Use tracking URL for manual check.",
    };
  }

  try {
    const res = await fetch(
      `https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
      {
        headers: { "DHL-API-Key": apiKey },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        carrier: "DHL",
        trackingNumber,
        status: "UNKNOWN",
        events: [],
        trackingUrl,
        error: `DHL API error ${res.status}: ${text}`,
      };
    }

    const data = await res.json();
    const shipment = data.shipments?.[0];
    if (!shipment) {
      return {
        carrier: "DHL",
        trackingNumber,
        status: "UNKNOWN",
        events: [],
        trackingUrl,
        error: "No shipment found for this tracking number.",
      };
    }

    const events: TrackingEvent[] = (shipment.events || []).map(
      (e: { timestamp?: string; location?: { address?: { addressLocality?: string } }; description?: string; statusCode?: string }) => ({
        timestamp: e.timestamp || "",
        location: e.location?.address?.addressLocality || "",
        description: e.description || "",
        status: e.statusCode || "",
      }),
    );

    return {
      carrier: "DHL",
      trackingNumber,
      status: mapDHLStatus(shipment.status?.statusCode),
      estimatedDelivery: shipment.estimatedTimeOfDelivery || undefined,
      events,
      trackingUrl,
      rawData: shipment,
    };
  } catch (err) {
    return {
      carrier: "DHL",
      trackingNumber,
      status: "UNKNOWN",
      events: [],
      trackingUrl,
      error: `DHL tracking failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function mapDHLStatus(code?: string): string {
  if (!code) return "UNKNOWN";
  const c = code.toLowerCase();
  if (c === "delivered") return "DELIVERED";
  if (c === "transit" || c === "in transit") return "IN_TRANSIT";
  if (c === "failure" || c === "returned") return "FAILED";
  if (c === "pre-transit" || c === "unknown") return "SHIPPED";
  return "IN_TRANSIT";
}

// ─── UPS TRACKING ─────────────────────────────────────────

let upsToken: { token: string; expiresAt: number } | null = null;

async function getUPSToken(): Promise<string | null> {
  const clientId = process.env.UPS_CLIENT_ID;
  const clientSecret = process.env.UPS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (upsToken && Date.now() < upsToken.expiresAt) {
    return upsToken.token;
  }

  try {
    const res = await fetch(
      "https://onlinetools.ups.com/security/v1/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    upsToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return upsToken.token;
  } catch {
    return null;
  }
}

async function trackUPS(trackingNumber: string): Promise<TrackingResult> {
  const trackingUrl = generateTrackingUrl("UPS", trackingNumber);
  const token = await getUPSToken();

  if (!token) {
    return {
      carrier: "UPS",
      trackingNumber,
      status: "UNKNOWN",
      events: [],
      trackingUrl,
      error:
        "UPS API credentials not configured. Use tracking URL for manual check.",
    };
  }

  try {
    const res = await fetch(
      `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(trackingNumber)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          transId: `mixsoon-${Date.now()}`,
          transactionSrc: "mixsoon",
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        carrier: "UPS",
        trackingNumber,
        status: "UNKNOWN",
        events: [],
        trackingUrl,
        error: `UPS API error ${res.status}: ${text}`,
      };
    }

    const data = await res.json();
    const pkg =
      data.trackResponse?.shipment?.[0]?.package?.[0];
    if (!pkg) {
      return {
        carrier: "UPS",
        trackingNumber,
        status: "UNKNOWN",
        events: [],
        trackingUrl,
        error: "No package found for this tracking number.",
      };
    }

    const events: TrackingEvent[] = (pkg.activity || []).map(
      (a: { date?: string; time?: string; location?: { address?: { city?: string; country?: string } }; status?: { description?: string; type?: string } }) => ({
        timestamp: `${a.date || ""} ${a.time || ""}`.trim(),
        location: [a.location?.address?.city, a.location?.address?.country]
          .filter(Boolean)
          .join(", "),
        description: a.status?.description || "",
        status: a.status?.type || "",
      }),
    );

    return {
      carrier: "UPS",
      trackingNumber,
      status: mapUPSStatus(pkg.currentStatus?.type),
      estimatedDelivery:
        pkg.deliveryDate?.[0]?.date || undefined,
      events,
      trackingUrl,
      rawData: pkg,
    };
  } catch (err) {
    return {
      carrier: "UPS",
      trackingNumber,
      status: "UNKNOWN",
      events: [],
      trackingUrl,
      error: `UPS tracking failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function mapUPSStatus(code?: string): string {
  if (!code) return "UNKNOWN";
  const c = code.toUpperCase();
  if (c === "D") return "DELIVERED";
  if (c === "I") return "IN_TRANSIT";
  if (c === "P") return "SHIPPED";
  if (c === "M" || c === "MV") return "SHIPPED";
  if (c === "X" || c === "RS") return "FAILED";
  return "IN_TRANSIT";
}

// ─── MAIN TRACK FUNCTION ──────────────────────────────────

export async function trackShipment(
  carrier: ShippingCarrier,
  trackingNumber: string,
): Promise<TrackingResult> {
  switch (carrier) {
    case "DHL":
      return trackDHL(trackingNumber);
    case "UPS":
      return trackUPS(trackingNumber);
    default:
      return {
        carrier: carrier,
        trackingNumber,
        status: "UNKNOWN",
        events: [],
        trackingUrl: generateTrackingUrl(carrier, trackingNumber),
        error: `API tracking not supported for ${carrier}. Use tracking URL.`,
      };
  }
}
