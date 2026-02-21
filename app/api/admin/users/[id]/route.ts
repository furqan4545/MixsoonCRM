import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

const VALID_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED"] as const;

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

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status, roleId } = body as { status?: string; roleId?: string };

  const data: { status?: (typeof VALID_STATUSES)[number]; roleId?: string } = {};

  if (typeof status === "string" && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    data.status = status as (typeof VALID_STATUSES)[number];
  }

  if (typeof roleId === "string" && roleId.trim()) {
    const role = await prisma.role.findUnique({
      where: { id: roleId.trim() },
    });
    if (role) data.roleId = role.id;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Provide status and/or roleId to update" },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      include: { role: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roleId: user.roleId,
      roleName: user.role.name,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[PATCH /api/admin/users]", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}
