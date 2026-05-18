import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { isAdminIsolationEnabled } from "@/app/lib/ownership";

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
    const searchOr = search
      ? [
          { username: { contains: search, mode: "insensitive" as const } },
          { displayName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ]
      : null;

    // Per-user isolation: admins see all by default; non-admins (or admins
    // when admin-isolation flag is on) see only owned + shared + PIC-assigned
    // influencers.
    const adminIsolated = await isAdminIsolationEnabled();
    const restrict = currentUser.role !== "Admin" || adminIsolated;
    let ownershipOr: Record<string, unknown>[] | null = null;
    if (restrict) {
      const shares = await prisma.resourceShare.findMany({
        where: { userId: currentUser.id, resourceType: "Influencer" },
        select: { resourceId: true },
      });
      const sharedIds = shares.map((s) => s.resourceId);
      ownershipOr = [
        { createdById: currentUser.id },
        { pics: { some: { userId: currentUser.id } } },
        ...(sharedIds.length > 0 ? [{ id: { in: sharedIds } }] : []),
      ];
    }

    // Combine the search OR (if any) with the ownership OR (if any) under AND
    if (searchOr && ownershipOr) {
      where.AND = [{ OR: searchOr }, { OR: ownershipOr }];
    } else if (searchOr) {
      where.OR = searchOr;
    } else if (ownershipOr) {
      where.OR = ownershipOr;
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

    // Lean list query — flat fields + small per-row eval window only.
    // Heavy 1-to-many relations (pics, campaigns) are fetched in parallel
    // batch queries below and joined in JS — much faster than nested selects.
    const t0 = Date.now();
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
          secondaryEmails: true,
          phone: true,
          biolink: true,
          bioLinkUrl: true,
          socialLinks: true,
          sourceFilename: true,
          pipelineStage: true,
          tags: true,
          notes: true,
          noteAttachments: true,
          aiScore: true,
          savedAt: true,
          createdAt: true,
          createdById: true,
          importId: true,
          // AI evals needed for queue tabs (Approved/Ok-ish/Rejected/Saved)
          aiEvaluations: {
            orderBy: { createdAt: "desc" },
            take: 2,
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
        },
      }),
    ]);
    const t1 = Date.now();

    const pageIds = influencers.slice(0, limit + 1).map((i) => i.id);

    // Batch-load relations (pics, campaigns, audience analytics) for visible
    // rows in parallel. One IN-clause query each beats Prisma's per-row nested
    // fetch. topCountries powers the "filter by audience country" UI.
    const [picRows, campaignRows, analyticsRows] = pageIds.length
      ? await Promise.all([
          prisma.influencerPic.findMany({
            where: { influencerId: { in: pageIds } },
            select: {
              influencerId: true,
              user: { select: { id: true, name: true, email: true } },
            },
          }),
          prisma.campaignInfluencer.findMany({
            where: { influencerId: { in: pageIds } },
            select: {
              influencerId: true,
              campaign: { select: { id: true, name: true, status: true } },
            },
          }),
          prisma.influencerAnalytics.findMany({
            where: { influencerId: { in: pageIds } },
            select: {
              influencerId: true,
              topCountries: true,
              influencerGender: true,
              influencerAgeRange: true,
              influencerEthnicity: true,
              influencerCountry: true,
            },
          }),
        ])
      : [[], [], []];
    const t2 = Date.now();

    const picsByInf = new Map<string, typeof picRows>();
    for (const r of picRows) {
      const arr = picsByInf.get(r.influencerId);
      if (arr) arr.push(r);
      else picsByInf.set(r.influencerId, [r]);
    }
    const campaignsByInf = new Map<string, typeof campaignRows>();
    for (const r of campaignRows) {
      const arr = campaignsByInf.get(r.influencerId);
      if (arr) arr.push(r);
      else campaignsByInf.set(r.influencerId, [r]);
    }
    const analyticsByInf = new Map<string, (typeof analyticsRows)[number]>();
    for (const r of analyticsRows) analyticsByInf.set(r.influencerId, r);
    console.log(
      `[influencers] limit=${limit} returned=${influencers.length} core=${t1 - t0}ms relations=${t2 - t1}ms total=${t2 - t0}ms`,
    );

    const hasMore = influencers.length > limit;
    const page = hasMore ? influencers.slice(0, limit) : influencers;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const serialized = page.map((inf) => {
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
        language: inf.language,
        country: inf.country,
        email: inf.email,
        secondaryEmails: inf.secondaryEmails,
        phone: inf.phone,
        biolink: inf.biolink,
        bioLinkUrl: inf.bioLinkUrl,
        socialLinks: inf.socialLinks,
        sourceFilename: inf.sourceFilename,
        importId: inf.importId,
        pipelineStage: inf.pipelineStage,
        tags: inf.tags,
        notes: inf.notes,
        noteAttachments: inf.noteAttachments,
        aiScore: inf.aiScore ?? latestEval?.score ?? null,
        queueBucket: savedEval?.bucket ?? null,
        queueEvalId: savedEval?.id ?? null,
        aiReasons: latestEval?.reasons ?? null,
        aiMatchedSignals: latestEval?.matchedSignals ?? null,
        aiRiskSignals: latestEval?.riskSignals ?? null,
        campaignName: latestEval?.run?.campaign?.name ?? null,
        // _count fields are not used in the list view — fetched on demand
        // via GET /api/influencers/[id] for the detail panel
        videoCount: 0,
        conversationCount: 0,
        // Heavy relations loaded on demand via GET /api/influencers/[id]
        videos: [],
        activityLogs: [],
        campaignAssignments: (campaignsByInf.get(inf.id) ?? []).map((ca) => ({
          campaignId: ca.campaign.id,
          campaignName: ca.campaign.name,
          campaignStatus: ca.campaign.status,
        })),
        analytics: (() => {
          const a = analyticsByInf.get(inf.id);
          if (!a) return null;
          return {
            influencerGender: a.influencerGender,
            influencerAgeRange: a.influencerAgeRange,
            influencerEthnicity: a.influencerEthnicity,
            influencerCountry: a.influencerCountry,
            topCountries: a.topCountries,
          };
        })(),
        pics: (picsByInf.get(inf.id) ?? []).map((p) => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
        })),
        importFilename: null,
        savedAt: inf.savedAt?.toISOString() ?? null,
        createdAt: inf.createdAt.toISOString(),
        createdById: inf.createdById,
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

// Extract a TikTok handle from a username, @handle, or profile URL.
// Returns null if the input doesn't contain a valid TikTok handle.
function extractTiktokUsername(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  // URL inputs MUST have a tiktok.com/@handle pattern — otherwise we'd
  // capture "https" from "https://..." (the original bug).
  if (/^https?:\/\//i.test(s) || /\btiktok\.com\//i.test(s)) {
    const m = s.match(/tiktok\.com\/@([a-zA-Z0-9._]+)/i);
    if (!m) return null;
    s = m[1];
  } else {
    s = s.replace(/^@+/, "");
  }
  s = s.toLowerCase();
  // TikTok handle rules: 2-24 chars, alphanumeric/underscore/period.
  if (!/^[a-z0-9._]{2,24}$/.test(s)) return null;
  return s;
}

// POST /api/influencers — Manually add a single influencer. Mirrors the
// /api/imports response shape so the frontend can hand off to /api/scrape
// for enrichment, reusing the same Apify pipeline as CSV imports.
export async function POST(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { usernameOrUrl, videoCount: requestedVideoCount } = body as {
      usernameOrUrl?: string;
      videoCount?: number;
    };

    if (!usernameOrUrl || typeof usernameOrUrl !== "string") {
      return NextResponse.json(
        { error: "usernameOrUrl is required" },
        { status: 400 },
      );
    }

    const username = extractTiktokUsername(usernameOrUrl);
    if (!username) {
      return NextResponse.json(
        {
          error:
            "Could not parse a TikTok handle from the input. Try @handle or https://tiktok.com/@handle.",
        },
        { status: 400 },
      );
    }

    const videoCount = Number.isFinite(requestedVideoCount) && requestedVideoCount! > 0
      ? Math.min(Math.floor(requestedVideoCount!), 100)
      : 20;

    // Categorize the same way /api/imports does so /api/scrape behaves identically.
    const existing = await prisma.influencer.findUnique({
      where: { username },
      select: { id: true, _count: { select: { videos: true } } },
    });

    const toScrape: string[] = [];
    const toRescrape: string[] = [];
    const skipped: string[] = [];

    if (!existing) {
      toScrape.push(username);
    } else if (existing._count.videos < videoCount) {
      toRescrape.push(username);
    } else {
      skipped.push(username);
    }

    const importRecord = await prisma.import.create({
      data: {
        sourceFilename: `Manual add: @${username}`,
        rowCount: 1,
        processedCount: 0,
        status: "PENDING",
        usernameLimit: 1,
        videoCount,
        createdById: currentUser.id,
      },
    });

    // If the influencer already exists, auto-assign current user as PIC
    // (matches /api/imports behavior for existing rows in a CSV).
    if (existing) {
      await prisma.influencerPic
        .create({
          data: { influencerId: existing.id, userId: currentUser.id },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      id: importRecord.id,
      sourceFilename: importRecord.sourceFilename,
      rowCount: 1,
      uniqueCount: 1,
      finalCount: 1,
      usernames: [username],
      toScrape,
      toRescrape,
      skipped,
      videoCount,
      status: importRecord.status,
      username,
      alreadyExists: !!existing,
    });
  } catch (error) {
    console.error("[POST /api/influencers]", error);
    return NextResponse.json(
      { error: "Failed to add influencer" },
      { status: 500 },
    );
  }
}
