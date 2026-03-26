import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

/**
 * GET /api/cron/cleanup-imports
 * Daily cron: hard-deletes imports + their influencers where autoDeleteAt has passed.
 * Protected by CRON_SECRET env var.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow unauthenticated in dev, require secret in prod
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredImports = await prisma.import.findMany({
    where: {
      autoDeleteAt: { not: null, lte: new Date() },
    },
    select: {
      id: true,
      sourceFilename: true,
      influencers: { select: { id: true } },
    },
  });

  if (expiredImports.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Nothing to clean up" });
  }

  let totalInfluencers = 0;

  for (const imp of expiredImports) {
    const influencerIds = imp.influencers.map((i) => i.id);

    if (influencerIds.length > 0) {
      // Delete all related records
      await prisma.$transaction([
        prisma.comment.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.analysisRun.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.influencerAnalytics.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.video.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.activityLog.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.emailMessage.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.emailAlert.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.influencerAiEvaluation.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.campaignInfluencer.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.approvalRequest.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.contentSubmission.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.contract.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.onboardingToken.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.influencerOnboarding.deleteMany({ where: { influencerId: { in: influencerIds } } }),
        prisma.influencer.deleteMany({ where: { id: { in: influencerIds } } }),
      ]);
      totalInfluencers += influencerIds.length;
    }

    // Delete the import itself
    await prisma.import.delete({ where: { id: imp.id } });

    // Notify
    await prisma.notification.create({
      data: {
        type: "import_cleanup",
        status: "info",
        title: `Auto-deleted: ${imp.sourceFilename}`,
        message: `Import "${imp.sourceFilename}" and ${influencerIds.length} influencers auto-deleted (no action taken within policy period).`,
      },
    }).catch(() => {});
  }

  return NextResponse.json({
    deleted: expiredImports.length,
    totalInfluencers,
    message: `Cleaned up ${expiredImports.length} expired import(s) with ${totalInfluencers} influencer(s)`,
  });
}
