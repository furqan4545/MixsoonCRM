/**
 * TikTok Performance Tracker
 * Fetches video stats via Apify, creates daily snapshots, checks viral thresholds.
 */

import { prisma } from "@/app/lib/prisma";

const APIFY_API_KEY = process.env.APIFY_API_KEY!;
const APIFY_ACTOR_ID = "ssOXktOBaQQiYfhc4";
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 min timeout per Apify run

interface ApifyVideoResult {
  // Stats - various field names across different Apify actors
  views?: number;
  playCount?: number;
  play_count?: number;
  bookmarks?: number;
  collectCount?: number;
  collect_count?: number;
  likes?: number;
  diggCount?: number;
  digg_count?: number;
  likeCount?: number;
  commentCount?: number;
  comment_count?: number;
  shareCount?: number;
  share_count?: number;
  // Metadata
  title?: string;
  desc?: string;
  signature?: string;
  video?: { cover?: string; dynamicCover?: string };
  // URL identification
  webVideoUrl?: string;
  videoUrl?: string;
  url?: string;
  id?: string;
  itemId?: string;
  aweme_id?: string;
  // Nested stats object (some actors)
  stats?: {
    playCount?: number;
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
  };
  // Alternative nesting
  authorStats?: Record<string, number>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch stats for a list of TikTok video URLs via Apify.
 * Returns a map of videoUrl → stats.
 */
export async function fetchVideoStats(
  videoUrls: string[],
): Promise<Map<string, { views: number; likes: number; comments: number; saves: number; shares: number; title?: string; thumbnail?: string }>> {
  if (!videoUrls.length || !APIFY_API_KEY) return new Map();

  // Extract usernames from URLs for the scraper
  // TikTok URLs: https://www.tiktok.com/@username/video/1234567890
  const usernames = new Set<string>();
  for (const url of videoUrls) {
    const match = url.match(/@([^/]+)/);
    if (match) usernames.add(match[1]);
  }

  if (usernames.size === 0) return new Map();

  try {
    // Start Apify run with those usernames
    const startRes = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${APIFY_API_KEY}`,
        },
        body: JSON.stringify({
          maxItems: videoUrls.length * 5 + 100, // extra buffer
          usernames: [...usernames],
          resultsPerPage: 30, // get enough to find our videos
        }),
      },
    );

    if (!startRes.ok) {
      console.error(`[tracker] Apify start failed: ${startRes.statusText}`);
      return new Map();
    }

    const startData = await startRes.json();
    const runId = startData.data.id as string;

    // Poll for completion
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        console.warn("[tracker] Apify run timed out");
        return new Map();
      }
      await sleep(3000);

      const statusRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
      );
      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      const status = statusData.data.status as string;
      if (status === "SUCCEEDED") break;
      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        console.warn(`[tracker] Apify run ${status}`);
        return new Map();
      }
    }

    // Fetch results
    const dataRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
      { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
    );
    if (!dataRes.ok) return new Map();

    const items = (await dataRes.json()) as ApifyVideoResult[];
    console.log(`[tracker] Apify returned ${items.length} items`);
    // Debug: log first item's keys and URL fields
    if (items.length > 0) {
      const first = items[0];
      console.log(`[tracker] First item keys: ${Object.keys(first).join(", ")}`);
      console.log(`[tracker] First item URLs: webVideoUrl=${first.webVideoUrl}, videoUrl=${first.videoUrl}, url=${first.url}, id=${first.id}, itemId=${first.itemId}, aweme_id=${first.aweme_id}`);
      console.log(`[tracker] First item stats: views=${first.views}, playCount=${first.playCount}, bookmarks=${first.bookmarks}, likes=${first.likes}, diggCount=${first.diggCount}`);
      if (first.stats) console.log(`[tracker] First item stats obj:`, JSON.stringify(first.stats));
    }
    console.log(`[tracker] Looking for URLs: ${videoUrls.join(", ")}`);

    // Build a map of video ID → our URL for matching
    const idToUrl = new Map<string, string>();
    const urlSet = new Set<string>();
    for (const url of videoUrls) {
      urlSet.add(normalizeUrl(url));
      const idMatch = url.match(/\/video\/(\d+)/);
      if (idMatch) idToUrl.set(idMatch[1], url);
    }

    const resultMap = new Map<string, { views: number; likes: number; comments: number; saves: number; shares: number; title?: string; thumbnail?: string }>();

    for (const item of items) {
      // Try to match by video ID first (most reliable)
      const itemId = item.id || item.itemId || item.aweme_id || "";
      const itemUrl = item.webVideoUrl || item.videoUrl || item.url || "";

      // Also try to extract ID from item URL
      const itemUrlIdMatch = itemUrl.match(/\/video\/(\d+)/);
      const extractedId = itemUrlIdMatch ? itemUrlIdMatch[1] : itemId;

      let matchedUrl: string | undefined;

      // Match by video ID
      if (extractedId && idToUrl.has(extractedId)) {
        matchedUrl = idToUrl.get(extractedId);
      }
      // Fallback: match by normalized URL
      if (!matchedUrl) {
        const normalized = normalizeUrl(itemUrl);
        if (urlSet.has(normalized)) {
          matchedUrl = videoUrls.find((u) => normalizeUrl(u) === normalized);
        }
      }

      if (matchedUrl) {
        const s = item.stats;
        const stats = {
          views: item.views ?? item.playCount ?? item.play_count ?? s?.playCount ?? 0,
          likes: item.likes ?? item.diggCount ?? item.digg_count ?? item.likeCount ?? s?.diggCount ?? 0,
          comments: item.commentCount ?? item.comment_count ?? s?.commentCount ?? 0,
          saves: item.bookmarks ?? item.collectCount ?? item.collect_count ?? s?.collectCount ?? 0,
          shares: item.shareCount ?? item.share_count ?? s?.shareCount ?? 0,
          title: item.title || item.desc || item.signature || undefined,
          thumbnail: item.video?.cover || item.video?.dynamicCover || undefined,
        };
        console.log(`[tracker] Matched ${matchedUrl}: ${stats.views} views, ${stats.likes} likes`);
        resultMap.set(matchedUrl, stats);
      }
    }

    console.log(`[tracker] Matched ${resultMap.size}/${videoUrls.length} videos`);
    return resultMap;
  } catch (err) {
    console.error("[tracker] fetchVideoStats error:", err);
    return new Map();
  }
}

function normalizeUrl(url: string): string {
  // Remove query params and trailing slashes for comparison
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

/**
 * Refresh stats for tracked videos. Creates snapshots and checks viral thresholds.
 * Returns count of videos refreshed.
 */
export async function refreshTrackedVideos(
  videoIds?: string[], // if provided, only refresh these; otherwise refresh all isTracking=true
): Promise<{ refreshed: number; viralAlerts: number }> {
  const where = videoIds
    ? { id: { in: videoIds }, isTracking: true }
    : { isTracking: true };

  const videos = await prisma.trackedVideo.findMany({
    where,
    select: { id: true, videoUrl: true, influencerId: true, currentViews: true, currentLikes: true, currentComments: true, currentSaves: true, currentShares: true },
  });

  if (videos.length === 0) return { refreshed: 0, viralAlerts: 0 };

  // Fetch stats from Apify
  const urls = videos.map((v) => v.videoUrl);
  const statsMap = await fetchVideoStats(urls);

  if (statsMap.size === 0) return { refreshed: 0, viralAlerts: 0 };

  // Load viral config
  let config = await prisma.viralAlertConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    config = await prisma.viralAlertConfig.create({ data: { id: "default" } });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let refreshed = 0;
  let viralAlertCount = 0;

  for (const video of videos) {
    const stats = statsMap.get(video.videoUrl);
    if (!stats) continue;

    // Update current stats
    await prisma.trackedVideo.update({
      where: { id: video.id },
      data: {
        currentViews: stats.views,
        currentLikes: stats.likes,
        currentComments: stats.comments,
        currentSaves: stats.saves,
        currentShares: stats.shares,
        lastTrackedAt: new Date(),
        ...(stats.title ? { title: stats.title } : {}),
        ...(stats.thumbnail ? { thumbnailUrl: stats.thumbnail } : {}),
      },
    });

    // Upsert daily snapshot
    await prisma.videoSnapshot.upsert({
      where: { trackedVideoId_recordedAt: { trackedVideoId: video.id, recordedAt: today } },
      update: {
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
        saves: stats.saves,
        shares: stats.shares,
      },
      create: {
        trackedVideoId: video.id,
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
        saves: stats.saves,
        shares: stats.shares,
        recordedAt: today,
      },
    });

    refreshed++;

    // Check viral thresholds (only alert once per metric per video)
    if (config.enabled) {
      const checks: { metric: string; value: number; threshold: number }[] = [
        { metric: "views", value: stats.views, threshold: config.viewsThreshold },
        { metric: "likes", value: stats.likes, threshold: config.likesThreshold },
        { metric: "comments", value: stats.comments, threshold: config.commentsThreshold },
        { metric: "saves", value: stats.saves, threshold: config.savesThreshold },
        { metric: "shares", value: stats.shares, threshold: config.sharesThreshold },
      ];

      for (const check of checks) {
        if (check.value >= check.threshold && check.threshold > 0) {
          // Check if we already alerted for this metric on this video
          const existing = await prisma.viralAlert.findFirst({
            where: {
              trackedVideoId: video.id,
              metric: check.metric,
            },
          });

          if (!existing) {
            await prisma.viralAlert.create({
              data: {
                trackedVideoId: video.id,
                influencerId: video.influencerId,
                metric: check.metric,
                threshold: check.threshold,
                valueAtAlert: check.value,
              },
            });
            viralAlertCount++;
          }
        }
      }
    }
  }

  return { refreshed, viralAlerts: viralAlertCount };
}
