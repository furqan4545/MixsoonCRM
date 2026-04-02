import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { generateTrackingUrl } from "@/app/lib/tracking";
import { ShipmentStatus, ShippingCarrier } from "@prisma/client";

// GET /api/shipments/[id] — get shipment detail with tracking
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("shipping", "read");
  const { id } = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      product: true,
      influencer: {
        select: {
          id: true, username: true, displayName: true, avatarUrl: true, email: true,
        },
      },
      campaign: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  return NextResponse.json(shipment);
}

// PATCH /api/shipments/[id] — update shipment (status, tracking, notes)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("shipping", "write");
  const { id } = await params;
  const body = await request.json();

  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  // Update carrier
  if (body.carrier !== undefined) {
    data.carrier = body.carrier as ShippingCarrier;
  }

  // Update tracking number
  if (body.trackingNumber !== undefined) {
    data.trackingNumber = body.trackingNumber;
    const carrier = (body.carrier || shipment.carrier) as ShippingCarrier;
    data.trackingUrl = body.trackingNumber
      ? generateTrackingUrl(carrier, body.trackingNumber)
      : null;
  }

  // Update notes
  if (body.notes !== undefined) data.notes = body.notes;

  // Status change with stock management
  if (body.status && body.status !== shipment.status) {
    const newStatus = body.status as ShipmentStatus;
    data.status = newStatus;

    await prisma.$transaction(async (tx) => {
      // Handle stock adjustments based on status transitions
      const oldStatus = shipment.status;

      if (newStatus === "SHIPPED" && oldStatus === "PENDING") {
        data.shippedAt = new Date();
      }

      if (newStatus === "DELIVERED") {
        data.deliveredAt = new Date();
        // Decrement both quantity and reserved by shipment quantity
        await tx.product.update({
          where: { id: shipment.productId },
          data: {
            quantity: { decrement: shipment.quantity },
            reserved: { decrement: shipment.quantity },
          },
        });
      }

      if (newStatus === "RETURNED" || newStatus === "FAILED") {
        // Product came back or failed — free up the reservation
        if (oldStatus !== "DELIVERED") {
          await tx.product.update({
            where: { id: shipment.productId },
            data: { reserved: { decrement: shipment.quantity } },
          });
        }
      }

      await tx.shipment.update({ where: { id }, data });
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        influencerId: shipment.influencerId,
        type: "shipment_status_changed",
        title: `Shipment status: ${newStatus}`,
        detail: `${shipment.product.name} (${shipment.product.sku}) — ${oldStatus} → ${newStatus}`,
      },
    });

    const updated = await prisma.shipment.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        influencer: { select: { id: true, username: true, displayName: true } },
      },
    });
    return NextResponse.json(updated);
  }

  // Non-status updates
  if (Object.keys(data).length > 0) {
    const updated = await prisma.shipment.update({
      where: { id },
      data,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        influencer: { select: { id: true, username: true, displayName: true } },
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "No fields to update" }, { status: 400 });
}

// DELETE /api/shipments/[id] — cancel shipment
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("shipping", "delete");
  const { id } = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: { product: true },
  });
  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // Only cancel non-delivered shipments, free reservation
  if (shipment.status !== "DELIVERED") {
    await prisma.$transaction([
      prisma.product.update({
        where: { id: shipment.productId },
        data: { reserved: { decrement: shipment.quantity } },
      }),
      prisma.shipment.delete({ where: { id } }),
    ]);
  } else {
    await prisma.shipment.delete({ where: { id } });
  }

  await prisma.activityLog.create({
    data: {
      influencerId: shipment.influencerId,
      type: "shipment_cancelled",
      title: "Shipment cancelled",
      detail: `${shipment.product.name} (${shipment.product.sku})`,
    },
  });

  return NextResponse.json({ success: true });
}
