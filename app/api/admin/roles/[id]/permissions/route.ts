import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("users", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id: roleId } = await params;
  let body: { permissions?: { feature: string; action: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const permissions = Array.isArray(body.permissions) ? body.permissions : [];
  const normalized = permissions
    .filter(
      (p): p is { feature: string; action: string } =>
        typeof p?.feature === "string" && typeof p?.action === "string",
    )
    .map((p) => ({
      feature: p.feature.trim().toLowerCase(),
      action: p.action.trim().toLowerCase(),
    }))
    .filter((p) => p.feature && p.action);

  const unique = Array.from(
    new Map(normalized.map((p) => [`${p.feature}:${p.action}`, p])).values(),
  );

  try {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.permission.deleteMany({ where: { roleId } }),
      ...(unique.length > 0
        ? [
            prisma.permission.createMany({
              data: unique.map((p) => ({ roleId, feature: p.feature, action: p.action })),
            }),
          ]
        : []),
    ]);

    const updated = await prisma.permission.findMany({
      where: { roleId },
      select: { feature: true, action: true },
    });
    return NextResponse.json({ permissions: updated });
  } catch (error) {
    console.error("[PATCH /api/admin/roles/:id/permissions]", error);
    return NextResponse.json(
      { error: "Failed to update permissions" },
      { status: 500 },
    );
  }
}
