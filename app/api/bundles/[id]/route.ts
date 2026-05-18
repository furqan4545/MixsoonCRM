import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string }> };

// GET /api/bundles/[id]
export async function GET(_request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "read");
  const { id } = await params;
  const bundle = await prisma.bundle.findUnique({
    where: { id },
    include: {
      _count: { select: { items: true, shipments: true } },
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, imageUrl: true, quantity: true, reserved: true },
          },
          variant: {
            select: { id: true, name: true, sku: true, imageUrl: true, quantity: true, reserved: true },
          },
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!bundle) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }
  return NextResponse.json({ bundle });
}

// PATCH /api/bundles/[id] — update name/description/region/imageUrl and/or
// REPLACE items wholesale. Items diff is intentional: easier to reason about
// from the UI than per-item add/remove endpoints.
export async function PATCH(request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "write");
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = String(body.name ?? "").trim();
  if ("description" in body)
    data.description = body.description?.trim() || null;
  if ("region" in body) data.region = body.region?.trim() || null;
  if ("imageUrl" in body) data.imageUrl = body.imageUrl?.trim() || null;

  if ("items" in body && Array.isArray(body.items)) {
    type ItemInput = { productId: string; variantId?: string | null; quantity?: number };
    const items = (body.items as ItemInput[])
      .filter((i) => i && typeof i.productId === "string")
      .map((i) => ({
        productId: i.productId,
        variantId: i.variantId || null,
        quantity: Math.max(1, Math.floor(Number(i.quantity ?? 1))),
      }));

    await prisma.$transaction([
      prisma.bundleItem.deleteMany({ where: { bundleId: id } }),
      ...(items.length
        ? [
            prisma.bundleItem.createMany({
              data: items.map((i) => ({ bundleId: id, ...i })),
            }),
          ]
        : []),
    ]);
  }

  const bundle = await prisma.bundle.update({
    where: { id },
    data,
    include: {
      _count: { select: { items: true, shipments: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, imageUrl: true } },
          variant: { select: { id: true, name: true, sku: true, imageUrl: true } },
        },
      },
    },
  });
  return NextResponse.json({ bundle });
}

// DELETE /api/bundles/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "write");
  const { id } = await params;
  await prisma.bundle.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
