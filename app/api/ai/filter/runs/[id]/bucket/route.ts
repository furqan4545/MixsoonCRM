import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../../lib/prisma";

// POST /api/ai/filter/runs/:id/bucket — Save all evaluations in a bucket
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: runId } = await params;
  const { bucket } = (await request.json()) as { bucket: string };

  if (!["APPROVED", "OKISH", "REJECTED"].includes(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const updated = await prisma.influencerAiEvaluation.updateMany({
    where: { runId, bucket: bucket as "APPROVED" | "OKISH" | "REJECTED" },
    data: { reviewStatus: "SAVED" },
  });

  return NextResponse.json({ saved: updated.count });
}

// DELETE /api/ai/filter/runs/:id/bucket — Discard all evaluations in a bucket
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: runId } = await params;
  const { bucket } = (await request.json()) as { bucket: string };

  if (!["APPROVED", "OKISH", "REJECTED"].includes(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  const deleted = await prisma.influencerAiEvaluation.deleteMany({
    where: { runId, bucket: bucket as "APPROVED" | "OKISH" | "REJECTED" },
  });

  return NextResponse.json({ deleted: deleted.count });
}
