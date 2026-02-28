import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { AiBucket } from "@prisma/client";

const VALID_BUCKETS = Object.values(AiBucket);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { evalIds, influencerIds, targetBucket } = body as {
      evalIds?: string[];
      influencerIds?: string[];
      targetBucket: string;
    };

    if (!VALID_BUCKETS.includes(targetBucket as AiBucket)) {
      return NextResponse.json(
        { error: "Invalid target bucket" },
        { status: 400 },
      );
    }

    const hasEvals = Array.isArray(evalIds) && evalIds.length > 0;
    const hasInfluencers =
      Array.isArray(influencerIds) && influencerIds.length > 0;

    if (!hasEvals && !hasInfluencers) {
      return NextResponse.json(
        { error: "evalIds or influencerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    let updatedCount = 0;
    let createdCount = 0;

    // Move already-scored influencers by updating their eval bucket
    if (hasEvals) {
      const result = await prisma.influencerAiEvaluation.updateMany({
        where: {
          id: { in: evalIds },
          reviewStatus: "SAVED",
        },
        data: {
          bucket: targetBucket as AiBucket,
        },
      });
      updatedCount = result.count;
    }

    // For unscored influencers, create a manual placement run + eval records
    if (hasInfluencers) {
      // Find or create a "Manual Placement" campaign-less run
      // We need a campaign for the run — use the first available one
      const campaign = await prisma.campaign.findFirst({
        orderBy: { createdAt: "desc" },
      });

      if (!campaign) {
        return NextResponse.json(
          { error: "No campaign found. Create a campaign first." },
          { status: 400 },
        );
      }

      const run = await prisma.aiFilterRun.create({
        data: {
          campaignId: campaign.id,
          strictness: 0,
          status: "COMPLETED",
          totalCount: influencerIds!.length,
          aiProcessedCount: 0,
          approvedCount:
            targetBucket === "APPROVED" ? influencerIds!.length : 0,
          okishCount: targetBucket === "OKISH" ? influencerIds!.length : 0,
          rejectedCount:
            targetBucket === "REJECTED" ? influencerIds!.length : 0,
        },
      });

      // Create eval records for each unscored influencer
      await prisma.influencerAiEvaluation.createMany({
        data: influencerIds!.map((id) => ({
          runId: run.id,
          influencerId: id,
          prefilterLabel: "PASS" as const,
          score: null,
          bucket: targetBucket as AiBucket,
          reasons: "Manually placed by user",
          reviewStatus: "SAVED" as const,
        })),
        skipDuplicates: true,
      });

      createdCount = influencerIds!.length;
    }

    return NextResponse.json({
      updated: updatedCount,
      created: createdCount,
      targetBucket,
    });
  } catch (error) {
    console.error("Failed to move queue:", error);
    return NextResponse.json(
      { error: "Failed to move between queues" },
      { status: 500 },
    );
  }
}
