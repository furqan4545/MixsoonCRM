import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { generateTrackingUrl } from "@/app/lib/tracking";
import { ShippingCarrier } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/shipments — list shipments with filters
export async function GET(request: NextRequest) {
  await requirePermission("shipping", "read");

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "";
  const campaignId = searchParams.get("campaignId") || "";
  const influencerId = searchParams.get("influencerId") || "";
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));

  const where: Record<string, unknown> = {};

  if (status) where.status = status;
  if (campaignId) where.campaignId = campaignId;
  if (influencerId) where.influencerId = influencerId;

  if (search) {
    where.OR = [
      { trackingNumber: { contains: search, mode: "insensitive" } },
      { influencer: { username: { contains: search, mode: "insensitive" } } },
      { influencer: { displayName: { contains: search, mode: "insensitive" } } },
      { product: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, imageUrl: true } },
        influencer: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        campaign: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shipment.count({ where }),
  ]);

  return NextResponse.json({ shipments, total, page, pageSize });
}

// POST /api/shipments — create a shipment (assign product to influencer)
export async function POST(request: NextRequest) {
  const user = await requirePermission("shipping", "write");

  const body = await request.json();
  const { productId, influencerId, campaignId, carrier, trackingNumber, notes } = body;
  const quantity = Math.max(1, parseInt(body.quantity) || 1);

  if (!productId || !influencerId) {
    return NextResponse.json(
      { error: "productId and influencerId are required" },
      { status: 400 },
    );
  }

  // Verify product exists and has stock
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const available = product.quantity - product.reserved;
  if (available < quantity) {
    return NextResponse.json(
      { error: `Only ${available} unit(s) available for "${product.name}" (${product.sku})` },
      { status: 400 },
    );
  }

  // Get influencer shipping address from onboarding
  const onboarding = await prisma.influencerOnboarding.findUnique({
    where: { influencerId },
    select: {
      fullName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postalCode: true,
      country: true,
    },
  });

  const carrierEnum = (carrier as ShippingCarrier) || "OTHER";
  const trackingUrl = trackingNumber
    ? generateTrackingUrl(carrierEnum, trackingNumber)
    : null;

  // Atomic: create ONE shipment with quantity + increment reserved
  const shipment = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { reserved: { increment: quantity } },
    });

    return tx.shipment.create({
      data: {
        productId,
        influencerId,
        campaignId: campaignId || null,
        quantity,
        carrier: carrierEnum,
        trackingNumber: trackingNumber || null,
        trackingUrl,
        shippingAddress: onboarding || null,
        notes: notes || null,
        createdById: user.id,
        status: trackingNumber ? "SHIPPED" : "PENDING",
        shippedAt: trackingNumber ? new Date() : null,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        influencer: { select: { id: true, username: true, displayName: true } },
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      influencerId,
      type: "shipment_created",
      title: `${quantity} unit${quantity > 1 ? "s" : ""} assigned for shipping`,
      detail: `${product.name} (${product.sku}) x${quantity} — ${carrierEnum}${trackingNumber ? ` #${trackingNumber}` : ""}`,
    },
  });

  return NextResponse.json(shipment, { status: 201 });
}
