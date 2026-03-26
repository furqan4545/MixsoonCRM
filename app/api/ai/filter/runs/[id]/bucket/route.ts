import { type NextRequest, NextResponse } from "next/server";
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

// DELETE /api/ai/filter/runs/:id/bucket — Move influencers to trash (soft-delete)
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

  // Find evals in this bucket to get influencer IDs
  const evals = await prisma.influencerAiEvaluation.findMany({
    where: { runId, bucket: bucket as "APPROVED" | "OKISH" | "REJECTED" },
    select: { id: true, influencerId: true },
  });

  if (evals.length === 0) {
    return NextResponse.json({ trashed: 0 });
  }

  const influencerIds = evals.map((e) => e.influencerId);

  // Mark evals as discarded (soft remove from AI filter view)
  await prisma.influencerAiEvaluation.updateMany({
    where: { id: { in: evals.map((e) => e.id) } },
    data: { reviewStatus: "DISCARDED" },
  });

  // Soft-delete the influencers (move to trash)
  await prisma.influencer.updateMany({
    where: { id: { in: influencerIds }, trashedAt: null },
    data: { trashedAt: new Date() },
  });

  return NextResponse.json({ trashed: evals.length });
}
