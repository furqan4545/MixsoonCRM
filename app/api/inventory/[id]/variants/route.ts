import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string }> };

// GET /api/inventory/[id]/variants — list variants for a product.
export async function GET(_request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "read");
  const { id } = await params;
  const variants = await prisma.productVariant.findMany({
    where: { productId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ variants });
}

// POST /api/inventory/[id]/variants — create a variant. Body: { name, sku, quantity?, imageUrl?, unitCost? }
export async function POST(request: NextRequest, { params }: Params) {
  await requirePermission("inventory", "write");
  const { id } = await params;
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const sku = String(body.sku ?? "").trim();
  if (!name || !sku) {
    return NextResponse.json({ error: "name and sku are required" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const dup = await prisma.productVariant.findUnique({ where: { sku } });
  if (dup) {
    return NextResponse.json(
      { error: `SKU "${sku}" is already in use` },
      { status: 409 },
    );
  }

  const variant = await prisma.productVariant.create({
    data: {
      productId: id,
      name,
      sku,
      quantity: Math.max(0, Math.floor(Number(body.quantity ?? 0))),
      imageUrl: body.imageUrl?.trim() || null,
      unitCost: body.unitCost != null ? Number(body.unitCost) : null,
    },
  });
  return NextResponse.json({ variant }, { status: 201 });
}
