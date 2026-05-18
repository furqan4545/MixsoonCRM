import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string; variantId: string }> };

// PATCH /api/inventory/[id]/variants/[variantId] — update variant fields.
export async function PATCH(request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "write");
  const { variantId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = String(body.name ?? "").trim();
  if ("sku" in body) data.sku = String(body.sku ?? "").trim();
  if ("imageUrl" in body) data.imageUrl = body.imageUrl?.trim() || null;
  if ("quantity" in body)
    data.quantity = Math.max(0, Math.floor(Number(body.quantity ?? 0)));
  if ("unitCost" in body)
    data.unitCost = body.unitCost != null ? Number(body.unitCost) : null;

  if (data.sku) {
    const dup = await prisma.productVariant.findFirst({
      where: { sku: data.sku as string, NOT: { id: variantId } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: `SKU "${data.sku}" is already in use` },
        { status: 409 },
      );
    }
  }

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data,
  });
  return NextResponse.json({ variant });
}

// DELETE /api/inventory/[id]/variants/[variantId] — delete a variant.
// Blocks if there are active shipments referencing it.
export async function DELETE(_request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "write");
  const { variantId } = await params;

  const activeShipments = await prisma.shipment.count({
    where: {
      variantId,
      status: { in: ["PENDING", "SHIPPED", "IN_TRANSIT"] },
    },
  });
  if (activeShipments > 0) {
    return NextResponse.json(
      {
        error: `Can't delete — ${activeShipments} active shipment${activeShipments !== 1 ? "s" : ""} reference this variant`,
      },
      { status: 409 },
    );
  }

  await prisma.productVariant.delete({ where: { id: variantId } });
  return NextResponse.json({ deleted: true });
}
