import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

const APIFY_API_KEY = process.env.APIFY_API_KEY!;
const APIFY_ACTOR_ID = "ssOXktOBaQQiYfhc4";
const BATCH_SIZE = 100;

interface ApifyChannel {
  username?: string;
  url?: string;
  bio?: string;
  followers?: number;
  avatar?: string;
  profilePicture?: string;
}

interface ApifyVideo {
  cover?: string;
}

interface ApifyItem {
  channel?: ApifyChannel;
  title?: string;
  views?: number;
  bookmarks?: number;
  uploadedAtFormatted?: string;
  video?: ApifyVideo;
}

// POST /api/scrape — Run Apify scrape for a given import
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { importId, usernames } = body as {
      importId: string;
      usernames: string[];
    };

    if (!importId || !usernames?.length) {
      return NextResponse.json(
        { error: "importId and usernames are required" },
        { status: 400 },
      );
    }

    // Update import status to PROCESSING
    const importRecord = await prisma.import.update({
      where: { id: importId },
      data: { status: "PROCESSING" },
    });

    const videoCount = importRecord.videoCount;
    const allResults: ApifyItem[] = [];

    // Process in batches
    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
      const batch = usernames.slice(i, i + BATCH_SIZE);
      const totalMaxItems = batch.length * videoCount;

      // Start Apify actor
      const startRes = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${APIFY_API_KEY}`,
          },
          body: JSON.stringify({
            maxItems: totalMaxItems + 300,
            usernames: batch,
            resultsPerPage: videoCount,
          }),
        },
      );

      if (!startRes.ok) {
        throw new Error(`Apify start failed: ${startRes.statusText}`);
      }

      const startData = await startRes.json();
      const runId = startData.data.id;

      // Poll for completion
      let finished = false;
      while (!finished) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}`,
          { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
        );
        const statusData = await statusRes.json();
        const runStatus = statusData.data.status;

        if (runStatus === "SUCCEEDED") {
          finished = true;
        } else if (runStatus === "FAILED" || runStatus === "ABORTED") {
          throw new Error(`Apify run ${runStatus}`);
        }
      }

      // Fetch dataset items
      const datasetRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
        { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
      );
      const items: ApifyItem[] = await datasetRes.json();
      allResults.push(...items);
    }

    // Normalize and write to DB
    const influencerMap = new Map<
      string,
      { profile: ApifyItem; videos: ApifyItem[] }
    >();

    for (const item of allResults) {
      const username =
        item.channel?.username?.toLowerCase().trim() ?? "unknown";
      if (!influencerMap.has(username)) {
        influencerMap.set(username, { profile: item, videos: [] });
      }
      const entry = influencerMap.get(username)!;
      entry.videos.push(item);
      // Keep only up to videoCount videos per influencer
      if (entry.videos.length > videoCount) {
        entry.videos = entry.videos.slice(0, videoCount);
      }
    }

    // Extract email from bio text
    function extractEmail(text: string | undefined | null): string | null {
      if (!text) return null;
      const match = text.match(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
      );
      return match?.[0] ?? null;
    }

    let processedCount = 0;

    // Get the source filename from the import record
    const sourceFilename = importRecord.sourceFilename;

    for (const [username, data] of influencerMap) {
      const profile = data.profile;
      const bio = profile.channel?.bio ?? null;

      // Get avatar URL (Apify returns it as avatar or profilePicture)
      const avatarUrl =
        profile.channel?.avatar ?? profile.channel?.profilePicture ?? null;

      // Upsert influencer
      const influencer = await prisma.influencer.upsert({
        where: { username },
        create: {
          username,
          profileUrl: profile.channel?.url ?? null,
          avatarUrl,
          biolink: bio,
          followers: profile.channel?.followers ?? null,
          email: extractEmail(bio),
          sourceFilename,
          importId: importId,
        },
        update: {
          profileUrl: profile.channel?.url ?? null,
          avatarUrl,
          biolink: bio,
          followers: profile.channel?.followers ?? null,
          email: extractEmail(bio),
          sourceFilename,
          importId: importId,
        },
      });

      // Delete old videos for this influencer, then insert new ones
      await prisma.video.deleteMany({
        where: { influencerId: influencer.id },
      });

      const videoData = data.videos.map((v) => ({
        influencerId: influencer.id,
        username,
        title: v.title ?? null,
        views: v.views ?? null,
        bookmarks: v.bookmarks ?? null,
        uploadedAt: v.uploadedAtFormatted
          ? new Date(v.uploadedAtFormatted)
          : null,
        thumbnailUrl: v.video?.cover ?? null,
      }));

      if (videoData.length > 0) {
        await prisma.video.createMany({ data: videoData });
      }

      processedCount++;
    }

    // Update import as completed
    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "COMPLETED",
        processedCount,
      },
    });

    return NextResponse.json({
      status: "COMPLETED",
      processedCount,
      totalVideos: allResults.length,
    });
  } catch (error) {
    console.error("Scrape error:", error);

    // Try to mark import as failed
    try {
      const body = await request.clone().json();
      if (body.importId) {
        await prisma.import.update({
          where: { id: body.importId },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    } catch {}

    return NextResponse.json(
      {
        error: "Scraping failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
