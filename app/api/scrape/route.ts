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

function extractEmail(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  return match?.[0] ?? null;
}

// POST /api/scrape — Run Apify scrape with SSE progress; incremental writes for existing influencers
export async function POST(request: NextRequest) {
  let importId: string | null = null;

  try {
    const body = await request.json();
    const {
      importId: id,
      toScrape = [],
      toRescrape = [],
      skipped = [],
      videoCount: requestedVideoCount,
    } = body as {
      importId: string;
      toScrape?: string[];
      toRescrape?: string[];
      skipped?: string[];
      videoCount?: number;
    };

    importId = id;

    if (!importId) {
      return NextResponse.json(
        { error: "importId is required" },
        { status: 400 },
      );
    }

    const usernamesToScrape = [...toScrape, ...toRescrape];
    const setRescrape = new Set(toRescrape.map((u) => u.toLowerCase().trim()));

    if (usernamesToScrape.length === 0 && skipped.length === 0) {
      await prisma.import.update({
        where: { id: importId },
        data: { status: "COMPLETED", processedCount: 0 },
      });
      return NextResponse.json({
        status: "COMPLETED",
        processedCount: 0,
        totalVideos: 0,
        message: "Nothing to scrape",
      });
    }

    const importRecord = await prisma.import.update({
      where: { id: importId },
      data: { status: "PROCESSING" },
    });

    const videoCount = requestedVideoCount ?? importRecord.videoCount;
    const sourceFilename = importRecord.sourceFilename;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          // Link skipped influencers to this import (no scrape)
          if (skipped.length > 0) {
            await prisma.influencer.updateMany({
              where: {
                username: { in: skipped.map((u) => u.toLowerCase().trim()) },
              },
              data: { importId, sourceFilename },
            });
          }

          if (usernamesToScrape.length === 0) {
            send({
              type: "complete",
              processedCount: skipped.length,
              totalVideos: 0,
              skipped: skipped.length,
            });
            controller.close();
            await prisma.import.update({
              where: { id: importId! },
              data: { status: "COMPLETED", processedCount: skipped.length },
            });
            return;
          }

          const allResults: ApifyItem[] = [];

          for (let i = 0; i < usernamesToScrape.length; i += BATCH_SIZE) {
            const batch = usernamesToScrape.slice(i, i + BATCH_SIZE);
            const totalMaxItems = batch.length * videoCount;

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

            const datasetRes = await fetch(
              `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
              { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
            );
            const items: ApifyItem[] = await datasetRes.json();
            allResults.push(...items);
          }

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
            if (entry.videos.length > videoCount) {
              entry.videos = entry.videos.slice(0, videoCount);
            }
          }

          const totalToProcess = influencerMap.size;
          let processedCount = 0;
          let totalVideosWritten = 0;

          for (const [username, data] of influencerMap) {
            const profile = data.profile;
            const bio = profile.channel?.bio ?? null;
            const avatarUrl =
              profile.channel?.avatar ?? profile.channel?.profilePicture ?? null;

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
                importId,
              },
              update: {
                profileUrl: profile.channel?.url ?? null,
                avatarUrl,
                biolink: bio,
                followers: profile.channel?.followers ?? null,
                email: extractEmail(bio),
                sourceFilename,
                importId,
              },
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

            const isRescrape = setRescrape.has(username);

            if (isRescrape) {
              const existingVideos = await prisma.video.findMany({
                where: { influencerId: influencer.id },
                select: { title: true, uploadedAt: true },
              });
              const existingSet = new Set(
                existingVideos.map(
                  (v) => `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`,
                ),
              );
              const newVideos = videoData.filter(
                (v) =>
                  !existingSet.has(
                    `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`,
                  ),
              );
              const slotsAvailable = videoCount - existingVideos.length;
              const toInsert = newVideos.slice(0, Math.max(0, slotsAvailable));
              if (toInsert.length > 0) {
                await prisma.video.createMany({ data: toInsert });
                totalVideosWritten += toInsert.length;
              }
            } else {
              if (videoData.length > 0) {
                await prisma.video.createMany({ data: videoData });
                totalVideosWritten += videoData.length;
              }
            }

            processedCount++;
            send({
              type: "progress",
              processed: processedCount,
              total: totalToProcess,
              username,
            });
          }

          await prisma.import.update({
            where: { id: importId! },
            data: {
              status: "COMPLETED",
              processedCount: processedCount + skipped.length,
            },
          });

          send({
            type: "complete",
            processedCount: processedCount + skipped.length,
            totalVideos: totalVideosWritten,
            skipped: skipped.length,
          });
        } catch (err) {
          console.error("Scrape error:", err);
          send({
            type: "error",
            error: err instanceof Error ? err.message : "Scraping failed",
          });
          if (importId) {
            await prisma.import.update({
              where: { id: importId },
              data: {
                status: "FAILED",
                errorMessage:
                  err instanceof Error ? err.message : "Unknown error",
              },
            });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Scrape error:", error);
    if (importId) {
      try {
        await prisma.import.update({
          where: { id: importId },
          data: {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        });
      } catch {}
    }
    return NextResponse.json(
      {
        error: "Scraping failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
