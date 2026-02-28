import { prisma } from "../lib/prisma";
import { fixThumbnailUrl } from "../lib/thumbnail";
import { InfluencersDashboard } from "./influencers-dashboard";

export const dynamic = "force-dynamic";

export default async function InfluencersPage() {
  const influencers = await prisma.influencer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      videos: { orderBy: { uploadedAt: "desc" } },
      _count: { select: { videos: true, emailMessages: true } },
      import: { select: { id: true, sourceFilename: true } },
      aiEvaluations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          score: true,
          bucket: true,
          reviewStatus: true,
          reasons: true,
          matchedSignals: true,
          riskSignals: true,
          run: { select: { campaign: { select: { name: true } } } },
        },
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      campaignAssignments: {
        include: {
          campaign: {
            select: { id: true, name: true, status: true },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });

  const serialized = influencers.map((inf) => {
    // Find the latest SAVED evaluation to determine queue bucket
    const savedEval = inf.aiEvaluations.find((e) => e.reviewStatus === "SAVED");
    const latestEval = inf.aiEvaluations[0] ?? null;

    return {
      id: inf.id,
      username: inf.username,
      displayName: inf.displayName,
      avatarUrl: inf.avatarUrl,
      avatarProxied: fixThumbnailUrl(inf.avatarUrl),
      profileUrl: inf.profileUrl,
      platform:
        inf.platform ??
        (inf.profileUrl?.includes("tiktok")
          ? "TikTok"
          : inf.profileUrl?.includes("instagram")
            ? "Instagram"
            : null),
      followers: inf.followers,
      engagementRate: inf.engagementRate,
      rate: inf.rate,
      country: inf.country,
      email: inf.email,
      phone: inf.phone,
      biolink: inf.biolink,
      bioLinkUrl: inf.bioLinkUrl,
      socialLinks: inf.socialLinks,
      sourceFilename: inf.sourceFilename,
      importId: inf.import?.id ?? null,
      importFilename: inf.import?.sourceFilename ?? null,
      pipelineStage: inf.pipelineStage,
      tags: inf.tags,
      notes: inf.notes,
      aiScore: inf.aiScore ?? latestEval?.score ?? null,
      // Queue data
      queueBucket: savedEval?.bucket ?? null, // APPROVED | OKISH | REJECTED | null
      queueEvalId: savedEval?.id ?? null,
      aiReasons: latestEval?.reasons ?? null,
      aiMatchedSignals: latestEval?.matchedSignals ?? null,
      aiRiskSignals: latestEval?.riskSignals ?? null,
      campaignName: latestEval?.run?.campaign?.name ?? null,
      videoCount: inf._count.videos,
      conversationCount: inf._count.emailMessages,
      videos: inf.videos.map((v) => ({
        id: v.id,
        title: v.title,
        views: v.views,
        bookmarks: v.bookmarks,
        uploadedAt: v.uploadedAt?.toISOString() ?? null,
        thumbnailUrl: v.thumbnailUrl,
        thumbnailProxied: fixThumbnailUrl(v.thumbnailUrl),
      })),
      activityLogs: inf.activityLogs.map((log) => ({
        id: log.id,
        type: log.type,
        title: log.title,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
      campaignAssignments: inf.campaignAssignments.map((ca) => ({
        campaignId: ca.campaign.id,
        campaignName: ca.campaign.name,
        campaignStatus: ca.campaign.status,
      })),
      createdAt: inf.createdAt.toISOString(),
    };
  });

  return <InfluencersDashboard influencers={serialized} />;
}
