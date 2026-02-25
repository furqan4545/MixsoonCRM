import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../../lib/prisma";

const DEFAULT_STALE_MS = 10 * 60 * 1000; // 10 minutes

function getStaleMs(): number {
  const raw = Number(process.env.AI_FILTER_STALE_MS ?? DEFAULT_STALE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_STALE_MS;
  return raw;
}

async function finalizeIfStale(runId: string) {
  const run = await prisma.aiFilterRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      totalCount: true,
      aiProcessedCount: true,
      reviewQueueCount: true,
      failedCount: true,
      updatedAt: true,
    },
  });
  if (!run || run.status !== "PROCESSING") return;

  const processedSoFar =
    run.aiProcessedCount + run.reviewQueueCount + run.failedCount;
  const staleMs = getStaleMs();
  const inactiveForMs = Date.now() - new Date(run.updatedAt).getTime();
  if (inactiveForMs < staleMs) return;

  const inactivityMins = Math.round(inactiveForMs / 60000);
  if (processedSoFar > 0) {
    await prisma.aiFilterRun.updateMany({
      where: { id: run.id, status: "PROCESSING" },
      data: {
        status: "COMPLETED",
        errorMessage: `Auto-finalized after ${inactivityMins}m inactivity. Partial run: ${processedSoFar}/${run.totalCount} processed.`,
      },
    });
  } else {
    await prisma.aiFilterRun.updateMany({
      where: { id: run.id, status: "PROCESSING" },
      data: {
        status: "FAILED",
        errorMessage: `Auto-stopped after ${inactivityMins}m inactivity before any influencer was processed.`,
      },
    });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await finalizeIfStale(id);
  const run = await prisma.aiFilterRun.findUnique({
    where: { id },
    select: {
      status: true,
      totalCount: true,
      aiProcessedCount: true,
      reviewQueueCount: true,
      approvedCount: true,
      okishCount: true,
      rejectedCount: true,
      failedCount: true,
      errorMessage: true,
      campaign: { select: { name: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const processedSoFar =
    run.aiProcessedCount + run.reviewQueueCount + run.failedCount;

  return NextResponse.json({
    status: run.status,
    totalCount: run.totalCount,
    processedCount: processedSoFar,
    aiProcessedCount: run.aiProcessedCount,
    reviewQueueCount: run.reviewQueueCount,
    approvedCount: run.approvedCount,
    okishCount: run.okishCount,
    rejectedCount: run.rejectedCount,
    failedCount: run.failedCount,
    errorMessage: run.errorMessage,
    campaignName: run.campaign.name,
  });
}
