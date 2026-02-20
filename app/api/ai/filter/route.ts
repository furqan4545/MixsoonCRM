import { type NextRequest, NextResponse } from "next/server";
import {
  mapScoreToBucket,
  runPreFilter,
  scoreWithGemini,
} from "../../../lib/ai-filter";
import { prisma } from "../../../lib/prisma";

function parseCsvKeywords(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = await request.json();
    const { campaignId, importId, strictness, targetKeywords, avoidKeywords } =
      body as {
        campaignId: string;
        importId?: string;
        strictness?: number;
        targetKeywords?: string[] | string;
        avoidKeywords?: string[] | string;
      };

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 },
      );
    }
    if (!importId) {
      return NextResponse.json(
        { error: "importId is required" },
        { status: 400 },
      );
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }

    const influencers = await prisma.influencer.findMany({
      where: { importId },
      include: {
        videos: {
          take: 20,
          orderBy: { uploadedAt: "desc" },
          select: { title: true, views: true },
        },
      },
      orderBy: { username: "asc" },
    });

    if (influencers.length === 0) {
      return NextResponse.json(
        { error: "No influencers found for this import" },
        { status: 400 },
      );
    }

    const resolvedStrictness = Math.max(
      0,
      Math.min(100, strictness ?? campaign.strictnessDefault),
    );
    const overrideTargets = Array.isArray(targetKeywords)
      ? targetKeywords
      : parseCsvKeywords(targetKeywords);
    const overrideAvoid = Array.isArray(avoidKeywords)
      ? avoidKeywords
      : parseCsvKeywords(avoidKeywords);

    runId = (
      await prisma.aiFilterRun.create({
        data: {
          campaignId,
          importId,
          strictness: resolvedStrictness,
          status: "PROCESSING",
          totalCount: influencers.length,
        },
      })
    ).id;

    const campaignContext = {
      campaignName: campaign.name,
      notes: campaign.notes,
      targetKeywords:
        overrideTargets.length > 0 ? overrideTargets : campaign.targetKeywords,
      avoidKeywords:
        overrideAvoid.length > 0 ? overrideAvoid : campaign.avoidKeywords,
      strictness: resolvedStrictness,
    };

    let aiProcessedCount = 0;
    let reviewQueueCount = 0;
    let approvedCount = 0;
    let okishCount = 0;
    let rejectedCount = 0;
    let failedCount = 0;

    const evaluationsData: Array<{
      runId: string;
      influencerId: string;
      prefilterLabel: "NONE" | "LIKELY_RELEVANT" | "REVIEW_QUEUE";
      score: number | null;
      bucket: "APPROVED" | "OKISH" | "REJECTED" | "REVIEW_QUEUE";
      reasons: string | null;
      matchedSignals: string | null;
      riskSignals: string | null;
      reviewStatus: "NOT_REVIEWED" | "APPROVED_FOR_AI" | "DISCARDED";
    }> = [];

    for (const influencer of influencers) {
      const pre = runPreFilter(
        {
          username: influencer.username,
          bio: influencer.biolink,
          followers: influencer.followers,
          email: influencer.email,
          phone: influencer.phone,
          socialLinks: influencer.socialLinks,
          videos: influencer.videos,
        },
        campaignContext,
      );

      if (!pre.shouldRunAi) {
        reviewQueueCount += 1;
        evaluationsData.push({
          runId,
          influencerId: influencer.id,
          prefilterLabel: pre.label,
          score: null,
          bucket: "REVIEW_QUEUE",
          reasons: pre.reason,
          matchedSignals: pre.matchedTarget.join(", ") || null,
          riskSignals: pre.matchedAvoid.join(", ") || null,
          reviewStatus: "NOT_REVIEWED",
        });
        continue;
      }

      try {
        const ai = await scoreWithGemini(
          {
            username: influencer.username,
            bio: influencer.biolink,
            followers: influencer.followers,
            email: influencer.email,
            phone: influencer.phone,
            socialLinks: influencer.socialLinks,
            videos: influencer.videos,
          },
          campaignContext,
        );
        const bucket = mapScoreToBucket(ai.score);
        aiProcessedCount += 1;
        if (bucket === "APPROVED") approvedCount += 1;
        else if (bucket === "OKISH") okishCount += 1;
        else rejectedCount += 1;

        evaluationsData.push({
          runId,
          influencerId: influencer.id,
          prefilterLabel: pre.label,
          score: ai.score,
          bucket,
          reasons: ai.reasons || pre.reason,
          matchedSignals:
            ai.matchedSignals || pre.matchedTarget.join(", ") || null,
          riskSignals: ai.riskSignals || pre.matchedAvoid.join(", ") || null,
          reviewStatus: "APPROVED_FOR_AI",
        });
      } catch (err) {
        failedCount += 1;
        evaluationsData.push({
          runId,
          influencerId: influencer.id,
          prefilterLabel: pre.label,
          score: null,
          bucket: "REJECTED",
          reasons:
            err instanceof Error
              ? `AI scoring failed: ${err.message}`
              : "AI scoring failed",
          matchedSignals: pre.matchedTarget.join(", ") || null,
          riskSignals: pre.matchedAvoid.join(", ") || null,
          reviewStatus: "APPROVED_FOR_AI",
        });
      }
    }

    if (evaluationsData.length > 0) {
      await prisma.influencerAiEvaluation.createMany({ data: evaluationsData });
    }

    await prisma.aiFilterRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        aiProcessedCount,
        reviewQueueCount,
        approvedCount,
        okishCount,
        rejectedCount,
        failedCount,
      },
    });

    return NextResponse.json({
      runId,
      totalCount: influencers.length,
      aiProcessedCount,
      reviewQueueCount,
      approvedCount,
      okishCount,
      rejectedCount,
      failedCount,
    });
  } catch (error) {
    console.error("AI filter run error:", error);
    if (runId) {
      await prisma.aiFilterRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
    return NextResponse.json(
      {
        error: "AI filter run failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
