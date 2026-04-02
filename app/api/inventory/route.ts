import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/inventory — list products with search, category filter, pagination
export async function GET(request: NextRequest) {
  await requirePermission("inventory", "read");

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const lowStock = searchParams.get("lowStock") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = category;
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        _count: { select: { shipments: true } },
        shipments: {
          where: { status: { not: "FAILED" } },
          select: {
            id: true,
            status: true,
            quantity: true,
            influencer: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

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
  await requirePermission("inventory", "write");

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
    },
  });

  return NextResponse.json(product, { status: 201 });
}
