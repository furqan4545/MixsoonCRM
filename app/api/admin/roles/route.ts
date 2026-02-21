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
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json({ roles });
  } catch (error) {
    console.error("[GET /api/admin/roles]", error);
    return NextResponse.json(
      { error: "Failed to load roles" },
      { status: 500 },
    );
  }
}
