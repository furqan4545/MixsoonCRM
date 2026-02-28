import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { AiBucket } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";

const VALID_BUCKETS = Object.values(AiBucket);

// PATCH /api/ai/queues/:id — Move a single evaluation to a different bucket
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const { bucket } = (await request.json()) as { bucket: string };

  if (!VALID_BUCKETS.includes(bucket as AiBucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const updated = await prisma.influencerAiEvaluation.update({
    where: { id },
    data: { bucket: bucket as AiBucket },
  });

  return NextResponse.json({ success: true, bucket: updated.bucket });
}

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
