import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { ownershipWhere } from "@/app/lib/ownership";

export const dynamic = "force-dynamic";

// GET /api/inventory — list products with search, category filter, pagination
export async function GET(request: NextRequest) {
  const currentUser = await requirePermission("inventory", "read");

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const lowStock = searchParams.get("lowStock") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));

  const where: Record<string, unknown> = {};

  const searchOr = search
    ? [
        { name: { contains: search, mode: "insensitive" as const } },
        { sku: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ]
    : null;

  if (category) {
    where.category = category;
  }

  const ownership = await ownershipWhere("Product", currentUser);
  const ownershipOr = ownership && "OR" in ownership ? ownership.OR : null;
  const ownershipBare = ownership && !("OR" in ownership) ? ownership : null;
  if (ownershipBare) Object.assign(where, ownershipBare);
  if (searchOr && ownershipOr) {
    where.AND = [{ OR: searchOr }, { OR: ownershipOr }];
  } else if (searchOr) {
    where.OR = searchOr;
  } else if (ownershipOr) {
    where.OR = ownershipOr;
  }

  const [productsRaw, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        _count: { select: { shipments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  // Load shipments in a separate batch query — the nested `include` with
  // a `where` filter was returning empty arrays in some cases. Direct lookup
  // by IN-clause is reliable.
  const productIds = productsRaw.map((p) => p.id);
  const shipmentRows = productIds.length
    ? await prisma.shipment.findMany({
        where: {
          productId: { in: productIds },
          status: { not: "FAILED" },
        },
        select: {
          id: true,
          productId: true,
          status: true,
          quantity: true,
          influencer: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const shipmentsByProduct = new Map<string, typeof shipmentRows>();
  for (const s of shipmentRows) {
    const arr = shipmentsByProduct.get(s.productId);
    if (arr) arr.push(s);
    else shipmentsByProduct.set(s.productId, [s]);
  }

  const products = productsRaw.map((p) => ({
    ...p,
    shipments: (shipmentsByProduct.get(p.id) ?? []).map(
      ({ productId: _omit, ...rest }) => rest,
    ),
  }));

  // Auto-reconcile stale `reserved` counters. Shipments cascade-delete when
  // an influencer is hard-deleted (schema.prisma: onDelete: Cascade), but the
  // Product.reserved counter is never decremented in that path — leaving
  // orphan reserved values. Fix: compute the truth from active shipments,
  // update the counter when it's wrong.
  const corrections: { id: string; correctReserved: number; was: number }[] = [];
  for (const p of products) {
    const activeQty = (shipmentsByProduct.get(p.id) ?? [])
      .filter((s) => s.status !== "DELIVERED") // delivered ones already decremented reserved
      .reduce((sum, s) => sum + (s.quantity ?? 1), 0);
    if (p.reserved !== activeQty) {
      corrections.push({ id: p.id, correctReserved: activeQty, was: p.reserved });
    }
  }

  if (corrections.length > 0) {
    await prisma.$transaction(
      corrections.map((c) =>
        prisma.product.update({
          where: { id: c.id },
          data: { reserved: c.correctReserved },
        }),
      ),
    );
    for (const c of corrections) {
      console.log(
        `[inventory] Reconciled product ${c.id}: reserved ${c.was} → ${c.correctReserved}`,
      );
      // Reflect the correction in the response we're about to return
      const p = products.find((x) => x.id === c.id);
      if (p) p.reserved = c.correctReserved;
    }
  }

  // If lowStock filter, post-filter (available = quantity - reserved)
  const result = lowStock
    ? products.filter((p) => p.quantity - p.reserved < 5)
    : products;

  // Get unique categories for filter dropdown
  const categories = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ["category"],
  });

  return NextResponse.json({
    products: result,
    total,
    page,
    pageSize,
    categories: categories.map((c) => c.category).filter(Boolean),
  });
}

// POST /api/inventory — create a single product
export async function POST(request: NextRequest) {
  const currentUser = await requirePermission("inventory", "write");

  const body = await request.json();
  const { name, sku, description, category, imageUrl, quantity, unitCost } = body;

  if (!name || !sku) {
    return NextResponse.json(
      { error: "Name and SKU are required" },
      { status: 400 },
    );
  }

  // Check SKU uniqueness
  const existing = await prisma.product.findUnique({ where: { sku } });
  if (existing) {
    return NextResponse.json(
      { error: `Product with SKU "${sku}" already exists` },
      { status: 409 },
    );
  }

  const product = await prisma.product.create({
    data: {
      name,
      sku,
      description: description || null,
      category: category || null,
      imageUrl: imageUrl || null,
      quantity: parseInt(quantity) || 0,
      unitCost: unitCost ? parseFloat(unitCost) : null,
      createdById: currentUser.id,
    },
  });

  return NextResponse.json(product, { status: 201 });
}
