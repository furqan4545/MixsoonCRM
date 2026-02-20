import { type NextRequest, NextResponse } from "next/server";
import {
  mapScoreToBucket,
  scoreWithGemini,
} from "../../../../../../lib/ai-filter";
import { prisma } from "../../../../../../lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { approveIds = [], discardIds = [] } = body as {
      approveIds?: string[];
      discardIds?: string[];
    };

    const run = await prisma.aiFilterRun.findUnique({
      where: { id },
      include: { campaign: true },
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (discardIds.length > 0) {
      await prisma.influencerAiEvaluation.updateMany({
        where: { id: { in: discardIds }, runId: id },
        data: {
          bucket: "REJECTED",
          reviewStatus: "DISCARDED",
          reasons: "Discarded by manual pre-filter review.",
          score: null,
        },
      });
    }

    if (approveIds.length > 0) {
      const evaluations = await prisma.influencerAiEvaluation.findMany({
        where: { id: { in: approveIds }, runId: id },
        include: {
          influencer: {
            include: {
              videos: {
                take: 20,
                orderBy: { uploadedAt: "desc" },
                select: { title: true, views: true },
              },
            },
          },
        },
      });

      for (const evalRow of evaluations) {
        try {
          const ai = await scoreWithGemini(
            {
              username: evalRow.influencer.username,
              bio: evalRow.influencer.biolink,
              followers: evalRow.influencer.followers,
              email: evalRow.influencer.email,
              phone: evalRow.influencer.phone,
              socialLinks: evalRow.influencer.socialLinks,
              videos: evalRow.influencer.videos,
            },
            {
              campaignName: run.campaign.name,
              notes: run.campaign.notes,
              targetKeywords: run.campaign.targetKeywords,
              avoidKeywords: run.campaign.avoidKeywords,
              strictness: run.strictness,
            },
          );

          await prisma.influencerAiEvaluation.update({
            where: { id: evalRow.id },
            data: {
              score: ai.score,
              bucket: mapScoreToBucket(ai.score),
              reasons: ai.reasons,
              matchedSignals: ai.matchedSignals,
              riskSignals: ai.riskSignals,
              reviewStatus: "APPROVED_FOR_AI",
            },
          });
        } catch (error) {
          await prisma.influencerAiEvaluation.update({
            where: { id: evalRow.id },
            data: {
              bucket: "REJECTED",
              reasons:
                error instanceof Error
                  ? `Manual-review AI scoring failed: ${error.message}`
                  : "Manual-review AI scoring failed",
              reviewStatus: "APPROVED_FOR_AI",
            },
          });
        }
      }
    }

    const rows = await prisma.influencerAiEvaluation.findMany({
      where: { runId: id },
      select: { bucket: true, reviewStatus: true },
    });

    const counts = rows.reduce(
      (acc, row) => {
        if (row.bucket === "APPROVED") acc.approvedCount += 1;
        else if (row.bucket === "OKISH") acc.okishCount += 1;
        else if (row.bucket === "REVIEW_QUEUE") acc.reviewQueueCount += 1;
        else acc.rejectedCount += 1;
        if (row.reviewStatus === "APPROVED_FOR_AI") acc.aiProcessedCount += 1;
        return acc;
      },
      {
        aiProcessedCount: 0,
        reviewQueueCount: 0,
        approvedCount: 0,
        okishCount: 0,
        rejectedCount: 0,
      },
    );

    await prisma.aiFilterRun.update({
      where: { id },
      data: counts,
    });

    return NextResponse.json({ success: true, ...counts });
  } catch (error) {
    console.error("Review queue action error:", error);
    return NextResponse.json(
      { error: "Failed to process review actions" },
      { status: 500 },
    );
  }
}
