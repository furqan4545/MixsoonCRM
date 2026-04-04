import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}

// GET /api/influencers — List influencers with cursor-based pagination
export async function GET(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("influencers", "read");
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
    const trash = searchParams.get("trash") === "true";
    const importId = searchParams.get("importId");
    // Allow loading all influencers — 213 is nothing, no need for tiny pages
    const maxLimit = 2000;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "500", 10) || 500,
      maxLimit,
    );

    const where: Record<string, unknown> = {};

    // Trash filter: show trashed or non-trashed
    if (trash) {
      where.trashedAt = { not: null };
    } else {
      where.trashedAt = null;
    }

    if (importId) {
      where.importId = importId;
    }
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

    // PIC isolation: non-Admin users only see influencers assigned to them
    if (currentUser.role !== "Admin") {
      where.pics = { some: { userId: currentUser.id } };
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
          campaignAssignments: {
            select: { campaignId: true },
          },
        },
      });
      const serialized = influencers.map((inf) => ({
        ...inf,
        avatarProxied: fixThumbnailUrl(inf.avatarUrl),
        campaignIds: inf.campaignAssignments.map((ca) => ca.campaignId),
        campaignAssignments: undefined,
      }));
      return NextResponse.json({ influencers: serialized });
    }

    // Ultra-lean list query — flat fields + counts ONLY (~500ms vs ~5.7s)
    // All relations (videos, evals, logs, campaigns, pics) fetched on click via GET /api/influencers/[id]
    const [totalCount, influencers] = await Promise.all([
      prisma.influencer.count({ where }),
      prisma.influencer.findMany({
        where,
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          profileUrl: true,
          platform: true,
          followers: true,
          engagementRate: true,
          rate: true,
          language: true,
          country: true,
          email: true,
          phone: true,
          biolink: true,
          bioLinkUrl: true,
          socialLinks: true,
          sourceFilename: true,
          pipelineStage: true,
          tags: true,
          notes: true,
          aiScore: true,
          savedAt: true,
          createdAt: true,
          importId: true,
          _count: { select: { videos: true, emailMessages: true } },
        },
      }),
    ]);

    const hasMore = influencers.length > limit;
    const page = hasMore ? influencers.slice(0, limit) : influencers;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const serialized = page.map((inf) => ({
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
      importId: inf.importId,
      pipelineStage: inf.pipelineStage,
      tags: inf.tags,
      notes: inf.notes,
      aiScore: inf.aiScore,
      videoCount: inf._count.videos,
      conversationCount: inf._count.emailMessages,
      // Relations loaded on demand via GET /api/influencers/[id]
      videos: [],
      activityLogs: [],
      campaignAssignments: [],
      analytics: null,
      pics: [],
      queueBucket: null,
      queueEvalId: null,
      aiReasons: null,
      aiMatchedSignals: null,
      aiRiskSignals: null,
      campaignName: null,
      importFilename: null,
      savedAt: inf.savedAt?.toISOString() ?? null,
      createdAt: inf.createdAt.toISOString(),
    }));

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
