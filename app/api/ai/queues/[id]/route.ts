import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../lib/prisma";

// DELETE /api/ai/queues/:id — Remove a single evaluation from saved queue
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("queues", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  await prisma.influencerAiEvaluation.update({
    where: { id },
    data: { reviewStatus: "DISCARDED" },
  });

  return NextResponse.json({ success: true });
}
