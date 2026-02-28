import { prisma } from "../lib/prisma";
import { fixThumbnailUrl } from "../lib/thumbnail";
import { CampaignsDashboard } from "./campaigns-dashboard";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  // Fetch all marketing campaigns with influencer preview data
  const campaigns = await prisma.marketingCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { influencers: true } },
      influencers: {
        include: {
          influencer: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              followers: true,
              platform: true,
              email: true,
              engagementRate: true,
              pipelineStage: true,
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });

  // Fetch approved influencers for the assign dialog
  const approvedInfluencers = await prisma.influencer.findMany({
    where: {
      aiEvaluations: {
        some: { reviewStatus: "SAVED", bucket: "APPROVED" },
      },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      followers: true,
      platform: true,
      email: true,
      engagementRate: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Also fetch Ok-ish influencers for the optional tab
  const okishInfluencers = await prisma.influencer.findMany({
    where: {
      aiEvaluations: {
        some: { reviewStatus: "SAVED", bucket: "OKISH" },
      },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      followers: true,
      platform: true,
      email: true,
      engagementRate: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedCampaigns = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    budget: c.budget,
    startDate: c.startDate?.toISOString() ?? null,
    endDate: c.endDate?.toISOString() ?? null,
    status: c.status,
    influencerCount: c._count.influencers,
    influencers: c.influencers.map((ci) => ({
      id: ci.influencer.id,
      username: ci.influencer.username,
      displayName: ci.influencer.displayName,
      avatarProxied: fixThumbnailUrl(ci.influencer.avatarUrl),
      followers: ci.influencer.followers,
      platform: ci.influencer.platform,
      email: ci.influencer.email,
      engagementRate: ci.influencer.engagementRate,
      pipelineStage: ci.influencer.pipelineStage,
      assignedAt: ci.assignedAt.toISOString(),
    })),
    createdAt: c.createdAt.toISOString(),
  }));

  const serializedApproved = approvedInfluencers.map((inf) => ({
    id: inf.id,
    username: inf.username,
    displayName: inf.displayName,
    avatarProxied: fixThumbnailUrl(inf.avatarUrl),
    followers: inf.followers,
    platform: inf.platform,
    email: inf.email,
    engagementRate: inf.engagementRate,
  }));

  const serializedOkish = okishInfluencers.map((inf) => ({
    id: inf.id,
    username: inf.username,
    displayName: inf.displayName,
    avatarProxied: fixThumbnailUrl(inf.avatarUrl),
    followers: inf.followers,
    platform: inf.platform,
    email: inf.email,
    engagementRate: inf.engagementRate,
  }));

  return (
    <CampaignsDashboard
      campaigns={serializedCampaigns}
      approvedInfluencers={serializedApproved}
      okishInfluencers={serializedOkish}
    />
  );
}
