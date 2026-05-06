import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

// GET /api/users/share-targets — Lightweight user list for the Share dialog.
// Returns minimal info (id, name, email, role) for every ACTIVE user except
// the caller themselves. Available to any authenticated user.
export async function GET() {
  const me = await getCurrentUser();
  if (!me?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      id: { not: me.id },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { name: true } },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role.name,
    })),
  });
}
