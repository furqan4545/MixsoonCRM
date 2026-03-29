import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/users — List active users for PIC picker
export async function GET() {
  try {
    await requirePermission("influencers", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        role: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role.name,
      })),
    );
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
