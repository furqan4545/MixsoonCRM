import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/bundles — list bundles with item counts.
// Optional ?region=US to filter by region.
export async function GET(request: NextRequest) {
  await requirePermission("inventory", "read");
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");

  const bundles = await prisma.bundle.findMany({
    where: region ? { region } : undefined,
    orderBy: { createdAt: "desc" },
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

  return NextResponse.json({ bundles });
}

// POST /api/bundles — create a bundle. Body: { name, description?, region?, imageUrl?, items? }
// items: [{ productId, variantId?, quantity }]
export async function POST(request: NextRequest) {
  const user = await requirePermission("inventory", "write");
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  type ItemInput = { productId: string; variantId?: string | null; quantity?: number };
  const rawItems: ItemInput[] = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .filter((i) => i && typeof i.productId === "string")
    .map((i) => ({
      productId: i.productId,
      variantId: i.variantId || null,
      quantity: Math.max(1, Math.floor(Number(i.quantity ?? 1))),
    }));

  const bundle = await prisma.bundle.create({
    data: {
      name,
      description: body.description?.trim() || null,
      region: body.region?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      createdById: user.id,
      items: items.length ? { create: items } : undefined,
    },
    include: {
      _count: { select: { items: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, imageUrl: true } },
          variant: { select: { id: true, name: true, sku: true, imageUrl: true } },
        },
      },
    },
  });
  return NextResponse.json({ bundle }, { status: 201 });
}
