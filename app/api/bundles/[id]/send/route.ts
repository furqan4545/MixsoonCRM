import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { ShippingCarrier } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

// POST /api/bundles/[id]/send
//   Body: { influencerIds: string[] (or legacy influencerId), campaignId?, carrier?, notes? }
//   Creates one Shipment per BundleItem × influencer. All shipments are
//   tagged with this bundle's id so we can group them in reporting / the
//   per-influencer view. Stock is decremented per variant (preferred) or
//   per product, atomically across the whole batch.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await requirePermission("shipping", "write");
  const { id } = await params;
  const body = await request.json();

  // Accept both shapes: legacy single `influencerId` and the new
  // multi-recipient `influencerIds`. Dedupe + drop falsy values.
  const rawIds: string[] = Array.isArray(body.influencerIds)
    ? body.influencerIds
    : body.influencerId
      ? [body.influencerId]
      : [];
  const influencerIds = Array.from(
    new Set(rawIds.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  if (influencerIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one influencer" },
      { status: 400 },
    );
  }

  const campaignId: string | null = body.campaignId || null;
  const carrier: ShippingCarrier = (body.carrier as ShippingCarrier) || "OTHER";
  const notes: string | null = body.notes || null;

  const bundle = await prisma.bundle.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, quantity: true, reserved: true } },
          variant: { select: { id: true, name: true, sku: true, quantity: true, reserved: true } },
        },
      },
    },
  });
  if (!bundle) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }
  if (bundle.items.length === 0) {
    return NextResponse.json(
      { error: "Bundle has no items" },
      { status: 400 },
    );
  }

  // Pre-flight stock check — required is (item.quantity × influencerCount).
  // We bail BEFORE the transaction so the caller gets one clear error
  // instead of a partial failure halfway through the batch.
  const n = influencerIds.length;
  const stockErrors: string[] = [];
  for (const item of bundle.items) {
    const required = item.quantity * n;
    if (item.variant) {
      const available = item.variant.quantity - item.variant.reserved;
      if (available < required) {
        stockErrors.push(
          `${item.product.name} — ${item.variant.name}: need ${required} (${item.quantity} × ${n}), have ${available}`,
        );
      }
    } else {
      const available = item.product.quantity - item.product.reserved;
      if (available < required) {
        stockErrors.push(
          `${item.product.name}: need ${required} (${item.quantity} × ${n}), have ${available}`,
        );
      }
    }
  }
  if (stockErrors.length > 0) {
    return NextResponse.json(
      { error: `Insufficient stock for ${n} influencer${n > 1 ? "s" : ""}: ${stockErrors.join("; ")}` },
      { status: 400 },
    );
  }

  // Load onboarding addresses for all selected influencers in one query.
  const onboardings = await prisma.influencerOnboarding.findMany({
    where: { influencerId: { in: influencerIds } },
    select: {
      influencerId: true,
      fullName: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      postalCode: true,
      country: true,
    },
  });
  const addrByInf = new Map(onboardings.map((o) => [o.influencerId, o]));

  // Atomic: ALL reservations + ALL shipments in one transaction. If any
  // influencer fails, the whole batch rolls back — nothing is left
  // half-reserved.
  const shipments = await prisma.$transaction(async (tx) => {
    const created = [];
    // Single bulk increment per item — n × quantity in one update each.
    for (const item of bundle.items) {
      const totalIncrement = item.quantity * n;
      if (item.variant) {
        await tx.productVariant.update({
          where: { id: item.variant.id },
          data: { reserved: { increment: totalIncrement } },
        });
      } else {
        await tx.product.update({
          where: { id: item.product.id },
          data: { reserved: { increment: totalIncrement } },
        });
      }
    }
    // Then create the shipments — fan out per influencer × per item.
    for (const influencerId of influencerIds) {
      const onboarding = addrByInf.get(influencerId);
      for (const item of bundle.items) {
        const s = await tx.shipment.create({
          data: {
            productId: item.product.id,
            variantId: item.variant?.id ?? null,
            bundleId: bundle.id,
            influencerId,
            campaignId,
            quantity: item.quantity,
            carrier,
            shippingAddress: onboarding ?? undefined,
            notes,
            createdById: user.id,
            status: "PENDING",
          },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            variant: { select: { id: true, name: true, sku: true } },
            influencer: { select: { id: true, username: true } },
          },
        });
        created.push(s);
      }
    }
    return created;
  });

  // One activity log per influencer so each profile shows the bundle send.
  await prisma.activityLog.createMany({
    data: influencerIds.map((influencerId) => ({
      influencerId,
      type: "bundle_sent",
      title: `Bundle sent: ${bundle.name}`,
      detail: `${bundle.items.length} shipment${bundle.items.length !== 1 ? "s" : ""} created from bundle "${bundle.name}"${bundle.region ? ` (${bundle.region})` : ""}`,
      createdById: user.id,
    })),
  });

  return NextResponse.json(
    {
      bundleId: bundle.id,
      influencerCount: n,
      shipmentCount: shipments.length,
      shipments,
    },
    { status: 201 },
  );
}
