import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../../lib/prisma";

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
    run.aiProcessedCount + run.reviewQueueCount;

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
