import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// GET /api/alerts/active-count — Lightweight endpoint for sidebar badge
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ count: 0 });
  }

  const hasRead = (user.permissions ?? []).some(
    (p) => p.feature === "alerts" && p.action === "read",
  );
  if (!hasRead) return NextResponse.json({ count: 0 });

  try {
    const count = await prisma.alertEvent.count({
      where: { status: "ACTIVE" },
    });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
