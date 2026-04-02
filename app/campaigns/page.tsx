import { prisma } from "../lib/prisma";
import { getCurrentUser } from "../lib/rbac";
import { fixThumbnailUrl } from "../lib/thumbnail";
import { CampaignsDashboard } from "./campaigns-dashboard";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === "Admin";

  // For non-admin (PIC), find campaigns that contain at least one influencer assigned to them
  // They can also see all campaigns in read-only mode via "All Campaigns" tab
  const picInfluencerFilter = !isAdmin && currentUser
    ? { pics: { some: { userId: currentUser.id } } }
    : undefined;

  // Fetch campaigns - for PICs, only campaigns with their assigned influencers
  // We fetch ALL campaigns but mark which ones the PIC is involved in
  const campaigns = await prisma.marketingCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { influencers: true, shipments: true } },
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
              pics: currentUser ? { select: { userId: true } } : false,
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });

  // Fetch approved influencers for the assign dialog (PIC-scoped)
  const approvedInfluencers = await prisma.influencer.findMany({
    where: {
      aiEvaluations: {
        some: { reviewStatus: "SAVED", bucket: "APPROVED" },
      },
      ...(picInfluencerFilter ?? {}),
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
      country: true,
      language: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Also fetch Ok-ish influencers for the optional tab (PIC-scoped)
  const okishInfluencers = await prisma.influencer.findMany({
    where: {
      aiEvaluations: {
        some: { reviewStatus: "SAVED", bucket: "OKISH" },
      },
      ...(picInfluencerFilter ?? {}),
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
      country: true,
      language: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedCampaigns = campaigns.map((c) => {
    // Check if current PIC user is involved in this campaign (has at least one assigned influencer)
    const isMyCampaign = isAdmin
      ? true
      : c.influencers.some((ci) =>
          (ci.influencer as any).pics?.some(
            (p: { userId: string }) => p.userId === currentUser?.id,
          ),
        );

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      budget: c.budget,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      status: c.status,
      influencerCount: c._count.influencers,
      shipmentCount: c._count.shipments,
      isMyCampaign,
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
    };
  });

  const serializedApproved = approvedInfluencers.map((inf) => ({
    id: inf.id,
    username: inf.username,
    displayName: inf.displayName,
    avatarProxied: fixThumbnailUrl(inf.avatarUrl),
    followers: inf.followers,
    platform: inf.platform,
    email: inf.email,
    engagementRate: inf.engagementRate,
    country: inf.country,
    language: inf.language,
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
    country: inf.country,
    language: inf.language,
  }));

  return (
    <CampaignsDashboard
      campaigns={serializedCampaigns}
      approvedInfluencers={serializedApproved}
      okishInfluencers={serializedOkish}
      isAdmin={isAdmin}
    />
  );
}
