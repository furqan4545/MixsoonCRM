import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

/**
 * DELETE /api/influencers/trash/permanent
 * Permanently delete influencers that are in trash.
 * Body: { ids: string[] }
 */
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { ids } = body as { ids: string[] };

  if (!ids?.length) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }

  // Safety: only allow permanent delete of trashed influencers
  const trashed = await prisma.influencer.findMany({
    where: { id: { in: ids }, trashedAt: { not: null } },
    select: { id: true, username: true },
  });

  if (trashed.length === 0) {
    return NextResponse.json({
      error: "No trashed influencers found with those IDs",
    }, { status: 404 });
  }

  const trashedIds = trashed.map((t) => t.id);

  // Delete related records in order (respecting foreign keys)
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.analysisRun.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.influencerAnalytics.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.video.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.activityLog.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.emailMessage.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.emailAlert.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.influencerAiEvaluation.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.campaignInfluencer.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.approvalRequest.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.contentSubmission.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.contract.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.onboardingToken.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.influencerOnboarding.deleteMany({ where: { influencerId: { in: trashedIds } } }),
    prisma.influencer.deleteMany({ where: { id: { in: trashedIds } } }),
  ]);

  return NextResponse.json({
    deleted: trashedIds.length,
    message: `${trashedIds.length} influencer${trashedIds.length !== 1 ? "s" : ""} permanently deleted`,
  });
}
