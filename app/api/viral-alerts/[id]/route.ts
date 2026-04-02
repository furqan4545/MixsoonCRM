import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// PATCH /api/viral-alerts/[id] — dismiss or acknowledge
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tracking", "write");
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "DISMISSED") data.dismissedAt = new Date();
  }

  try {
    const updated = await prisma.viralAlert.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    // Alert may have been cascade-deleted already
    return NextResponse.json({ dismissed: true });
  }
}
