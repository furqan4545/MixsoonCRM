import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { trackShipment } from "@/app/lib/tracking";
import { ShipmentStatus } from "@prisma/client";

// POST /api/shipments/[id]/track — refresh tracking data from carrier API
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("shipping", "read");
  const { id } = await params;

  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (!shipment.trackingNumber) {
    return NextResponse.json(
      { error: "No tracking number set" },
      { status: 400 },
    );
  }

  // Check cache staleness (2 hours)
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  if (
    shipment.lastTrackedAt &&
    Date.now() - shipment.lastTrackedAt.getTime() < TWO_HOURS
  ) {
    return NextResponse.json({
      tracking: shipment.lastTrackingData,
      cached: true,
      lastTrackedAt: shipment.lastTrackedAt,
    });
  }

  const result = await trackShipment(shipment.carrier, shipment.trackingNumber);

  // Map tracking result status to ShipmentStatus enum
  const statusMap: Record<string, ShipmentStatus> = {
    DELIVERED: "DELIVERED",
    IN_TRANSIT: "IN_TRANSIT",
    SHIPPED: "SHIPPED",
    FAILED: "FAILED",
  };
  const newStatus = statusMap[result.status];

  const updateData: Record<string, unknown> = {
    lastTrackingData: result,
    lastTrackedAt: new Date(),
  };

  // Auto-update shipment status if carrier gives a clear status
  if (newStatus && newStatus !== shipment.status) {
    updateData.status = newStatus;
    if (newStatus === "DELIVERED" && !shipment.deliveredAt) {
      updateData.deliveredAt = new Date();

      // Decrement stock on delivery
      if (shipment.status !== "DELIVERED") {
        await prisma.product.update({
          where: { id: shipment.productId },
          data: {
            quantity: { decrement: (shipment.quantity ?? 1) },
            reserved: { decrement: (shipment.quantity ?? 1) },
          },
        });
      }
    }

    await prisma.activityLog.create({
      data: {
        influencerId: shipment.influencerId,
        type: "shipment_status_changed",
        title: `Shipment auto-updated: ${newStatus}`,
        detail: `Tracking #${shipment.trackingNumber} — ${shipment.status} → ${newStatus}`,
      },
    });
  }

  await prisma.shipment.update({ where: { id }, data: updateData });

  return NextResponse.json({
    tracking: result,
    cached: false,
    lastTrackedAt: new Date(),
    statusUpdated: newStatus && newStatus !== shipment.status ? newStatus : null,
  });
}
