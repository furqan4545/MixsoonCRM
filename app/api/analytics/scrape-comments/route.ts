import { after, type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { scrapeComments, DEFAULT_CONFIG } from "../../../lib/audience-analysis";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { influencerId } = await request.json();

  if (!influencerId) {
    return NextResponse.json({ error: "influencerId is required" }, { status: 400 });
  }

  const influencer = await prisma.influencer.findUnique({
    where: { id: influencerId },
    include: {
      videos: {
        orderBy: { views: "desc" },
        take: DEFAULT_CONFIG.videosToSample,
        select: { username: true },
      },
    },
  });

  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  const cfg = await prisma.analysisConfig.findUnique({ where: { id: "default" } });
  const config = {
    ...DEFAULT_CONFIG,
    videosToSample: cfg?.videosToSample ?? DEFAULT_CONFIG.videosToSample,
    commentsPerVideo: cfg?.commentsPerVideo ?? DEFAULT_CONFIG.commentsPerVideo,
    maxTotalComments: cfg?.maxTotalComments ?? DEFAULT_CONFIG.maxTotalComments,
  };

  after(async () => {
    try {
      const videoUrls = influencer.videos.map(
        (v) => `https://www.tiktok.com/@${v.username}`,
      );

      const comments = await scrapeComments(
        influencer.username,
        videoUrls,
        config,
      );

      await prisma.comment.deleteMany({ where: { influencerId } });
      await prisma.comment.createMany({
        data: comments.map((c) => ({
          influencerId,
          text: c.text,
          username: c.username ?? null,
          avatarUrl: c.avatarUrl ?? null,
          likes: c.likes ?? 0,
          replyCount: c.replyCount ?? 0,
          videoUrl: c.videoUrl ?? null,
          commentedAt: c.commentedAt ? new Date(c.commentedAt) : null,
        })),
      });

      console.log(`[Scrape Comments] Saved ${comments.length} comments for @${influencer.username}`);
    } catch (err) {
      console.error("[Scrape Comments] Failed:", err);
    }
  });

  return NextResponse.json({ status: "started" });
}
