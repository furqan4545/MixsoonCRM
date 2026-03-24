import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}

// GET /api/influencers — List influencers with cursor-based pagination
export async function GET(request: NextRequest) {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const pipelineStage = searchParams.get("pipelineStage");
    const cursor = searchParams.get("cursor");
    const search = searchParams.get("search");
    const minimal = searchParams.get("minimal") === "true";
    // Minimal mode can fetch more (small payload per record); full mode caps at 100
    const maxLimit = minimal ? 2000 : 100;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10) || 50,
      maxLimit,
    );

    const where: Record<string, unknown> = {};
    if (pipelineStage) {
      where.pipelineStage = pipelineStage;
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    // Minimal mode: for selects & approval dialogs
    if (minimal) {
      const influencers = await prisma.influencer.findMany({
        where,
        take: limit,
        orderBy: { username: "asc" },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          email: true,
          followers: true,
          platform: true,
          country: true,
          engagementRate: true,
          profileUrl: true,
        },
      });
      const serialized = influencers.map((inf) => ({
        ...inf,
        avatarProxied: fixThumbnailUrl(inf.avatarUrl),
      }));
      return NextResponse.json({ influencers: serialized });
    }

    // Full mode with pagination for the dashboard
    const totalCount = await prisma.influencer.count({ where });

    const influencers = await prisma.influencer.findMany({
      where,
      take: limit + 1, // fetch one extra to check if there's a next page
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
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
        analytics: {
          select: {
            influencerGender: true,
            influencerAgeRange: true,
            influencerEthnicity: true,
            influencerCountry: true,
          },
        },
      },
    });

    const hasMore = influencers.length > limit;
    const page = hasMore ? influencers.slice(0, limit) : influencers;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const serialized = page.map((inf) => {
      const savedEval = inf.aiEvaluations.find(
        (e) => e.reviewStatus === "SAVED",
      );
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
        language: inf.language,
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
        queueBucket: savedEval?.bucket ?? null,
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
          videoUrl: v.videoUrl ?? null,
          tiktokId: v.tiktokId ?? null,
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
        analytics: inf.analytics ?? null,
        createdAt: inf.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      influencers: serialized,
      nextCursor,
      totalCount,
    });
  } catch (error) {
    console.error("[GET /api/influencers]", error);
    return NextResponse.json(
      { influencers: [], nextCursor: null, totalCount: 0 },
      { status: 500 },
    );
  }
}
