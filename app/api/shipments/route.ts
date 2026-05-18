import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { isAdminIsolationEnabled } from "@/app/lib/ownership";
import { generateTrackingUrl } from "@/app/lib/tracking";
import { ShippingCarrier } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/shipments — list shipments with filters
export async function GET(request: NextRequest) {
  const currentUser = await requirePermission("shipping", "read");

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

  // Per-user isolation: filter on Shipment.createdById (already in schema)
  const adminIsolated = await isAdminIsolationEnabled();
  if (currentUser.role !== "Admin" || adminIsolated) {
    where.createdById = currentUser.id;
  }

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
  const { productId, variantId, bundleId, influencerId, campaignId, carrier, trackingNumber, notes } = body;
  const quantity = Math.max(1, parseInt(body.quantity) || 1);

  if (!productId || !influencerId) {
    return NextResponse.json(
      { error: "productId and influencerId are required" },
      { status: 400 },
    );
  }

  // Verify product exists.
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // When a variant is selected, stock tracking lives on the variant — the
  // parent product's quantity is informational only. Otherwise fall back to
  // the legacy single-SKU product stock.
  let variant:
    | { id: string; name: string; sku: string; quantity: number; reserved: number; productId: string }
    | null = null;
  if (variantId) {
    variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, name: true, sku: true, quantity: true, reserved: true, productId: true },
    });
    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }
    if (variant.productId !== productId) {
      return NextResponse.json(
        { error: "Variant doesn't belong to the selected product" },
        { status: 400 },
      );
    }
    const available = variant.quantity - variant.reserved;
    if (available < quantity) {
      return NextResponse.json(
        { error: `Only ${available} unit(s) available for "${product.name} — ${variant.name}" (${variant.sku})` },
        { status: 400 },
      );
    }
  } else {
    const available = product.quantity - product.reserved;
    if (available < quantity) {
      return NextResponse.json(
        { error: `Only ${available} unit(s) available for "${product.name}" (${product.sku})` },
        { status: 400 },
      );
    }
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

  // Atomic: create ONE shipment with quantity + increment reserved on the
  // variant if present (variant stock takes precedence), else on the product.
  const shipment = await prisma.$transaction(async (tx) => {
    if (variant) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { reserved: { increment: quantity } },
      });
    } else {
      await tx.product.update({
        where: { id: productId },
        data: { reserved: { increment: quantity } },
      });
    }

    return tx.shipment.create({
      data: {
        productId,
        variantId: variant?.id ?? null,
        bundleId: bundleId || null,
        influencerId,
        campaignId: campaignId || null,
        quantity,
        carrier: carrierEnum,
        trackingNumber: trackingNumber || null,
        trackingUrl,
        shippingAddress: onboarding ?? undefined,
        notes: notes || null,
        createdById: user.id,
        status: trackingNumber ? "SHIPPED" : "PENDING",
        shippedAt: trackingNumber ? new Date() : null,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true, sku: true } },
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
