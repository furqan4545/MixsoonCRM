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

type CampaignContext = {
  campaignName: string | null;
  notes: string | null;
  targetKeywords: string[];
  avoidKeywords: string[];
  strictness: number;
};

type InfluencerWithVideos = Awaited<
  ReturnType<typeof prisma.influencer.findMany<{
    include: {
      videos: { take: number; orderBy: { uploadedAt: "desc" }; select: { title: true; views: true } };
    };
  }>>
>[number];

function notifyQuiet(data: Parameters<typeof prisma.notification.create>[0]["data"]) {
  return prisma.notification.create({ data }).catch((e) => {
    console.error("[AI filter] notification error:", e);
  });
}

async function runAiFilterBackground(params: {
  runId: string;
  campaignName: string;
  influencers: InfluencerWithVideos[];
  campaignContext: CampaignContext;
}) {
  const { runId, campaignName, influencers, campaignContext } = params;
  const total = influencers.length;
  let aiProcessedCount = 0;
  let reviewQueueCount = 0;
  let approvedCount = 0;
  let okishCount = 0;
  let rejectedCount = 0;
  let failedCount = 0;
  let stepIndex = 0;

  await notifyQuiet({
    type: "ai_filter",
    status: "info",
    title: `AI filter started — ${campaignName}`,
    message: `Scoring ${total} influencer${total === 1 ? "" : "s"}…`,
    runId,
  });

  try {
    for (const influencer of influencers) {
      stepIndex += 1;
      const tag = `[${stepIndex}/${total}]`;

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
        await prisma.influencerAiEvaluation.create({
          data: {
            runId,
            influencerId: influencer.id,
            prefilterLabel: pre.label,
            score: null,
            bucket: "REVIEW_QUEUE",
            reasons: pre.reason,
            matchedSignals: pre.matchedTarget.join(", ") || null,
            riskSignals: pre.matchedAvoid.join(", ") || null,
            reviewStatus: "NOT_REVIEWED",
          },
        });

        await notifyQuiet({
          type: "ai_filter",
          status: "info",
          title: `${tag} @${influencer.username} → Review Queue`,
          message: pre.reason || "Sent to manual review (pre-filter).",
          runId,
        });
      } else {
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

          await prisma.influencerAiEvaluation.create({
            data: {
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
            },
          });

          await notifyQuiet({
            type: "ai_filter",
            status: bucket === "REJECTED" ? "error" : "success",
            title: `${tag} @${influencer.username} → ${bucket} (${ai.score})`,
            message: ai.reasons || null,
            runId,
          });
        } catch (err) {
          failedCount += 1;
          const reason =
            err instanceof Error
              ? `AI scoring failed: ${err.message}`
              : "AI scoring failed";

          await prisma.influencerAiEvaluation.create({
            data: {
              runId,
              influencerId: influencer.id,
              prefilterLabel: pre.label,
              score: null,
              bucket: "REJECTED",
              reasons: reason,
              matchedSignals: pre.matchedTarget.join(", ") || null,
              riskSignals: pre.matchedAvoid.join(", ") || null,
              reviewStatus: "APPROVED_FOR_AI",
            },
          });

          await notifyQuiet({
            type: "ai_filter",
            status: "error",
            title: `${tag} @${influencer.username} — scoring failed`,
            message: reason,
            runId,
          });
        }
      }

      await prisma.aiFilterRun.update({
        where: { id: runId },
        data: {
          aiProcessedCount,
          reviewQueueCount,
          approvedCount,
          okishCount,
          rejectedCount,
          failedCount,
        },
      });
    }

    await prisma.aiFilterRun.update({
      where: { id: runId },
      data: { status: "COMPLETED" },
    });

    await notifyQuiet({
      type: "ai_filter",
      status: "success",
      title: `AI filter complete — ${campaignName}`,
      message: `${total} influencer${total === 1 ? "" : "s"} scored. Approved: ${approvedCount}, OK-ish: ${okishCount}, Rejected: ${rejectedCount}, Review: ${reviewQueueCount}.`,
      runId,
    });
  } catch (error) {
    console.error("[AI filter] background error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await prisma.aiFilterRun
      .update({
        where: { id: runId },
        data: { status: "FAILED", errorMessage: errMsg },
      })
      .catch(() => {});

    await notifyQuiet({
      type: "ai_filter",
      status: "error",
      title: `AI filter failed — ${campaignName}`,
      message: errMsg,
      runId,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { requirePermission } = await import("@/app/lib/rbac");
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
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

    const run = await prisma.aiFilterRun.create({
      data: {
        campaignId,
        importId,
        strictness: resolvedStrictness,
        status: "PROCESSING",
        totalCount: influencers.length,
      },
    });

    const campaignContext: CampaignContext = {
      campaignName: campaign.name,
      notes: campaign.notes,
      targetKeywords:
        overrideTargets.length > 0 ? overrideTargets : campaign.targetKeywords,
      avoidKeywords:
        overrideAvoid.length > 0 ? overrideAvoid : campaign.avoidKeywords,
      strictness: resolvedStrictness,
    };

    runAiFilterBackground({
      runId: run.id,
      campaignName: campaign.name,
      influencers,
      campaignContext,
    }).catch((err) => console.error("[AI filter] unhandled:", err));

    return NextResponse.json(
      { runId: run.id, totalCount: influencers.length },
      { status: 202 },
    );
  } catch (error) {
    console.error("AI filter start error:", error);
    return NextResponse.json(
      {
        error: "AI filter run failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
