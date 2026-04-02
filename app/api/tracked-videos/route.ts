import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/tracked-videos — list tracked videos with stats + snapshots
export async function GET(request: NextRequest) {
  await requirePermission("tracking", "read");

  const { searchParams } = request.nextUrl;
  const influencerId = searchParams.get("influencerId") || "";
  const campaignId = searchParams.get("campaignId") || "";
  const trackingOnly = searchParams.get("trackingOnly") !== "false";
  const search = searchParams.get("search") || "";

  const where: Record<string, unknown> = {};
  if (trackingOnly) where.isTracking = true;
  if (influencerId) where.influencerId = influencerId;
  if (campaignId) where.campaignId = campaignId;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { videoUrl: { contains: search, mode: "insensitive" } },
      { influencer: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const videos = await prisma.trackedVideo.findMany({
    where,
    include: {
      influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      campaign: { select: { id: true, name: true } },
      snapshots: {
        orderBy: { recordedAt: "desc" },
        take: 14, // last 14 days for sparkline
        select: { views: true, likes: true, comments: true, saves: true, shares: true, recordedAt: true },
      },
      _count: { select: { viralAlerts: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json(videos);
}

// POST /api/tracked-videos — add URL(s) for tracking
export async function POST(request: NextRequest) {
  await requirePermission("tracking", "write");

  const body = await request.json();
  const { videoUrls, influencerId, campaignId } = body as {
    videoUrls: string[];
    influencerId: string;
    campaignId?: string;
  };

  if (!videoUrls?.length || !influencerId) {
    return NextResponse.json(
      { error: "videoUrls and influencerId are required" },
      { status: 400 },
    );
  }

  // Filter to TikTok URLs only
  const tiktokUrls = videoUrls.filter((u) =>
    u.includes("tiktok.com") || u.includes("vm.tiktok.com"),
  );

  if (tiktokUrls.length === 0) {
    return NextResponse.json(
      { error: "No valid TikTok URLs provided" },
      { status: 400 },
    );
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const url of tiktokUrls) {
    const existing = await prisma.trackedVideo.findUnique({ where: { videoUrl: url } });
    if (existing) {
      skipped.push(url);
      continue;
    }

    // Extract tiktokId from URL
    const idMatch = url.match(/\/video\/(\d+)/);
    const tiktokId = idMatch ? idMatch[1] : null;

    await prisma.trackedVideo.create({
      data: {
        videoUrl: url,
        tiktokId,
        influencerId,
        campaignId: campaignId || null,
        isTracking: true,
      },
    });
    created.push(url);
  }

  return NextResponse.json({ created: created.length, skipped: skipped.length }, { status: 201 });
}
