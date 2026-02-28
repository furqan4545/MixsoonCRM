import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// GET /api/approvals/pending-count — Lightweight endpoint for sidebar badge
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") {
    return NextResponse.json({ count: 0 });
  }

  const hasRead = (user.permissions ?? []).some(
    (p) => p.feature === "approvals" && p.action === "read",
  );
  if (!hasRead) return NextResponse.json({ count: 0 });

  try {
    const where =
      user.role === "Admin"
        ? { status: "PENDING" as const }
        : { submittedById: user.id, status: "PENDING" as const };

    const count = await prisma.approvalRequest.count({ where });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
