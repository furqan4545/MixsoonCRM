import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export async function GET() {
  try {
    await requirePermission("users", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        role: { select: { id: true, name: true } },
      },
    });

    const list = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: u.status,
      roleId: u.roleId,
      roleName: u.role.name,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json({ users: list });
  } catch (error) {
    console.error("[GET /api/admin/users]", error);
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 },
    );
  }
}
