import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/inventory/[id] — get single product with shipment history
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("inventory", "read");
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      shipments: {
        include: {
          influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          campaign: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

// PATCH /api/inventory/[id] — update product details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("inventory", "write");
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.sku !== undefined) data.sku = body.sku;
  if (body.description !== undefined) data.description = body.description;
  if (body.category !== undefined) data.category = body.category;
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  if (body.quantity !== undefined) data.quantity = parseInt(body.quantity);
  if (body.unitCost !== undefined) data.unitCost = body.unitCost ? parseFloat(body.unitCost) : null;

  // If changing SKU, check uniqueness
  if (data.sku) {
    const existing = await prisma.product.findUnique({
      where: { sku: data.sku as string },
    });
    if (existing && existing.id !== id) {
      return NextResponse.json(
        { error: `SKU "${data.sku}" already in use` },
        { status: 409 },
      );
    }
  }

  const product = await prisma.product.update({ where: { id }, data });
  return NextResponse.json(product);
}

// DELETE /api/inventory/[id] — delete product (only if no active shipments)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("inventory", "delete");
  const { id } = await params;

  const activeShipments = await prisma.shipment.count({
    where: {
      productId: id,
      status: { in: ["PENDING", "SHIPPED", "IN_TRANSIT"] },
    },
  });

  if (activeShipments > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${activeShipments} active shipment(s) exist` },
      { status: 400 },
    );
  }

  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
