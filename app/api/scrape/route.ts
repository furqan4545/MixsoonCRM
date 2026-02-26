import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../lib/prisma";

const APIFY_API_KEY = process.env.APIFY_API_KEY!;
const APIFY_ACTOR_ID = "ssOXktOBaQQiYfhc4";
const BATCH_SIZE = 100;
const MAX_INFLUENCER_RETRIES = 5;
const RETRY_BACKOFF_MS = 2000;
const MAX_APIFY_RUN_WAIT_MS = 10 * 60 * 1000;

interface ApifyChannel {
  username?: string;
  url?: string;
  bio?: string;
  signature?: string; // some actors use this for bio
  followers?: number;
  avatar?: string;
  profilePicture?: string;
  email?: string;
  phone?: string;
  link?: string;
  bioLink?: string | { url?: string };
  bioLinkUrl?: string;
  website?: string;
  linkInBio?: string;
  profileLink?: string;
  externalLink?: string;
  socialLinks?: string[] | string;
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

interface InfluencerScrapeData {
  profile: ApifyItem | null;
  videos: ApifyItem[];
  channelVideoCount: number | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUsername(value: string | undefined | null): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim().replace(/^@/, "");
  return normalized || null;
}

function dedupeAndLimitVideos(items: ApifyItem[], limit: number): ApifyItem[] {
  const out: ApifyItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.title ?? ""}|${item.uploadedAtFormatted ?? ""}|${item.video?.cover ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function extractChannelVideoCount(channel?: ApifyChannel): number | null {
  if (!channel || typeof channel !== "object") return null;
  const record = channel as unknown as Record<string, unknown>;
  const candidates = [
    "videoCount",
    "videosCount",
    "videos",
    "postsCount",
    "postCount",
    "awemeCount",
    "aweme_count",
    "totalVideos",
  ];

  for (const key of candidates) {
    const raw = record[key];
    const numeric =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric);
    }
  }
  return null;
}

async function runApifyForUsernames(
  usernames: string[],
  videoCount: number,
): Promise<ApifyItem[]> {
  const totalMaxItems = usernames.length * videoCount;
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
        usernames,
        resultsPerPage: videoCount,
      }),
    },
  );

  if (!startRes.ok) {
    throw new Error(`Apify start failed: ${startRes.statusText}`);
  }

  const startData = await startRes.json();
  const runId = startData.data.id as string;

  const pollStartedAt = Date.now();
  while (true) {
    if (Date.now() - pollStartedAt > MAX_APIFY_RUN_WAIT_MS) {
      throw new Error(`Apify run timed out after ${MAX_APIFY_RUN_WAIT_MS}ms`);
    }
    await sleep(5000);
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      {
        headers: { Authorization: `Bearer ${APIFY_API_KEY}` },
      },
    );
    if (!statusRes.ok) {
      throw new Error(`Apify status failed: ${statusRes.statusText}`);
    }
    const statusData = await statusRes.json();
    const runStatus = statusData.data.status as string;

    if (runStatus === "SUCCEEDED") {
      break;
    }
    if (
      runStatus === "FAILED" ||
      runStatus === "ABORTED" ||
      runStatus === "TIMED-OUT"
    ) {
      throw new Error(`Apify run ${runStatus}`);
    }
  }

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
    { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
  );
  if (!datasetRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${datasetRes.statusText}`);
  }
  return (await datasetRes.json()) as ApifyItem[];
}

function extractEmail(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match?.[0] ?? null;
}

function extractPhone(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = text.match(
    /(?:\+?[\d\s\-()]{10,20}|[\d]{3}[\s.-][\d]{3}[\s.-][\d]{4})/,
  );
  return match?.[0]?.trim() ?? null;
}

/** True if URL is the TikTok profile page (we use this for profileUrl only, not bioLinkUrl). */
function isTiktokProfileUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("tiktok.com")) return false;
    // Exclude only profile links like https://www.tiktok.com/@username
    return /^\/@[^/]+\/?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Normalize link-like value to a full URL, supporting protocol-less domains. */
function normalizeUrlCandidate(
  value: string | null | undefined,
): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[.,;:!?)]+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (
    /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s\]\)]*)?$/i.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }
  return null;
}

/** Extract first URL from bio text (https, www., or short links like feedlink.io/lonefoxhome) so we capture bio link when actor doesn't return a separate field. */
function extractUrlFromBio(text: string | undefined | null): string | null {
  if (!text) return null;
  // Remove emails first so we don't treat their domain as website links.
  const withoutEmails = text.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    " ",
  );
  const matches = withoutEmails.match(
    /https?:\/\/[^\s\]\)]+|www\.[^\s\]\)]+|[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s\]\)]*)?/gi,
  );
  if (!matches) return null;
  for (const raw of matches) {
    const normalized = normalizeUrlCandidate(raw);
    if (!normalized) continue;
    if (isTiktokProfileUrl(normalized)) continue;
    return normalized;
  }
  return null;
}

/** Parse bio for IG, YT, FB, X, TT etc. and return canonical URLs so we don't miss social links. */
function extractSocialHandlesFromBio(bio: string | undefined | null): string[] {
  if (!bio) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (url: string) => {
    const norm = url.toLowerCase().replace(/\/+$/, "");
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(url);
    }
  };

  // Instagram (Instagram: / IG:)
  const igLong = bio.matchAll(/(?:Instagram|insta)[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of igLong) add(`https://instagram.com/${m[1]}`);
  const igShort = bio.matchAll(/\bIG[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of igShort) add(`https://instagram.com/${m[1]}`);

  // YouTube (YouTube: / YT:)
  const ytLong = bio.matchAll(/(?:YouTube|Youtube)[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of ytLong) add(`https://youtube.com/@${m[1]}`);
  const ytShort = bio.matchAll(/\bYT[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of ytShort) add(`https://youtube.com/@${m[1]}`);

  // Facebook (Facebook: / FB:)
  const fbLong = bio.matchAll(/(?:Facebook|facebook)[:\s]*@?([a-zA-Z0-9.]+)/gi);
  for (const m of fbLong) add(`https://facebook.com/${m[1]}`);
  const fbShort = bio.matchAll(/\bFB[:\s]*@?([a-zA-Z0-9.]+)/gi);
  for (const m of fbShort) add(`https://facebook.com/${m[1]}`);

  // X / Twitter
  const xMatch = bio.matchAll(/(?:X|Twitter)[:\s]*@?([a-zA-Z0-9_]+)/gi);
  for (const m of xMatch) add(`https://x.com/${m[1]}`);

  // TikTok (TT: / TikTok:)
  const ttShort = bio.matchAll(/\bTT[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of ttShort) add(`https://tiktok.com/@${m[1]}`);
  const ttLong = bio.matchAll(/(?:TikTok|tiktok)[:\s]*@?([a-zA-Z0-9_.]+)/gi);
  for (const m of ttLong) add(`https://tiktok.com/@${m[1]}`);

  return out;
}

function normalizeSocialLinks(
  links: string[] | string | undefined | null,
  bio?: string | null,
): string | null {
  const arr = links ? (Array.isArray(links) ? links : [links]) : [];
  const urls = arr.filter((u) => typeof u === "string" && u.startsWith("http"));
  const fromBio = bio ? extractSocialHandlesFromBio(bio) : [];
  const combined = [...urls];
  const seen = new Set(urls.map((u) => u.toLowerCase().replace(/\/+$/, "")));
  for (const u of fromBio) {
    const n = u.toLowerCase().replace(/\/+$/, "");
    if (!seen.has(n)) {
      seen.add(n);
      combined.push(u);
    }
  }
  return combined.length > 0 ? JSON.stringify(combined) : null;
}

// POST /api/scrape — Run Apify scrape with SSE progress; incremental writes for existing influencers
export async function POST(request: NextRequest) {
  try {
    await requirePermission("data-scraper", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let importId: string | null = null;

  try {
    const body = await request.json();
    const {
      importId: id,
      toScrape = [],
      toRescrape = [],
      skipped = [],
      videoCount: requestedVideoCount,
      refreshSkippedProfiles = false,
    } = body as {
      importId: string;
      toScrape?: string[];
      toRescrape?: string[];
      skipped?: string[];
      videoCount?: number;
      refreshSkippedProfiles?: boolean;
    };

    importId = id;

    if (!importId) {
      return NextResponse.json(
        { error: "importId is required" },
        { status: 400 },
      );
    }

    let setRescrape = new Set(
      toRescrape
        .map((u) => normalizeUsername(u))
        .filter((u): u is string => Boolean(u)),
    );
    let setSkipped = new Set(
      skipped
        .map((u) => normalizeUsername(u))
        .filter((u): u is string => Boolean(u)),
    );

    // When refresh is enabled, wipe all existing data for these usernames and scrape fresh
    if (refreshSkippedProfiles) {
      const allUsernames = [...toScrape, ...toRescrape, ...skipped]
        .map((u) => normalizeUsername(u))
        .filter((u): u is string => Boolean(u));
      if (allUsernames.length > 0) {
        const existing = await prisma.influencer.findMany({
          where: { username: { in: allUsernames } },
          select: { id: true },
        });
        if (existing.length > 0) {
          const ids = existing.map((i) => i.id);
          await prisma.influencerAiEvaluation.deleteMany({
            where: { influencerId: { in: ids } },
          });
          await prisma.video.deleteMany({
            where: { influencerId: { in: ids } },
          });
          await prisma.influencer.deleteMany({
            where: { id: { in: ids } },
          });
        }
      }
      setRescrape = new Set();
      setSkipped = new Set();
    }

    const usernamesToScrape = refreshSkippedProfiles
      ? [...toScrape, ...toRescrape, ...skipped]
      : [...toScrape, ...toRescrape];

    if (usernamesToScrape.length === 0 && skipped.length === 0) {
      await prisma.import.update({
        where: { id: importId },
        data: { status: "DRAFT", processedCount: 0 },
      });
      return NextResponse.json({
        status: "DRAFT",
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
          // Link skipped influencers to this import only when not refreshing their profiles (we'll link when processing)
          if (skipped.length > 0 && !refreshSkippedProfiles) {
            const normalizedSkipped = skipped
              .map((u) => normalizeUsername(u))
              .filter((u): u is string => Boolean(u));
            await prisma.influencer.updateMany({
              where: {
                username: { in: normalizedSkipped },
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
              data: { status: "DRAFT", processedCount: skipped.length },
            });
            return;
          }

          const normalizedTargetUsernames = [
            ...new Set(
              usernamesToScrape
                .map((u) => normalizeUsername(u))
                .filter((u): u is string => Boolean(u)),
            ),
          ];

          const influencerMap = new Map<string, InfluencerScrapeData>();
          for (const username of normalizedTargetUsernames) {
            influencerMap.set(username, {
              profile: null,
              videos: [],
              channelVideoCount: null,
            });
          }

          const mergeItemsIntoInfluencerMap = (items: ApifyItem[]) => {
            for (const item of items) {
              const username = normalizeUsername(item.channel?.username);
              if (!username) continue;
              const entry = influencerMap.get(username);
              if (!entry) continue;
              if (!entry.profile) entry.profile = item;
              entry.videos.push(item);
              const reportedVideoCount = extractChannelVideoCount(item.channel);
              if (reportedVideoCount != null) {
                entry.channelVideoCount =
                  entry.channelVideoCount == null
                    ? reportedVideoCount
                    : Math.max(entry.channelVideoCount, reportedVideoCount);
              }
            }
          };

          const getIncompleteUsernames = (): string[] => {
            const out: string[] = [];
            for (const [username, data] of influencerMap) {
              data.videos = dedupeAndLimitVideos(data.videos, videoCount);
              const currentCount = data.videos.length;
              const hasEnoughVideos = currentCount >= videoCount;
              const apiSaysNoMoreVideos =
                data.channelVideoCount != null &&
                data.channelVideoCount <= currentCount;

              if (!hasEnoughVideos && !apiSaysNoMoreVideos) {
                out.push(username);
              }
            }
            return out;
          };

          send({
            type: "stage",
            message: `Running initial scrape for ${normalizedTargetUsernames.length} influencers...`,
          });
          for (
            let i = 0;
            i < normalizedTargetUsernames.length;
            i += BATCH_SIZE
          ) {
            const batch = normalizedTargetUsernames.slice(i, i + BATCH_SIZE);
            const items = await runApifyForUsernames(batch, videoCount);
            mergeItemsIntoInfluencerMap(items);
          }

          for (let attempt = 1; attempt <= MAX_INFLUENCER_RETRIES; attempt++) {
            const usernamesMissingVideos = getIncompleteUsernames();
            if (usernamesMissingVideos.length === 0) {
              break;
            }

            send({
              type: "stage",
              message: `Retrying incomplete influencers: ${usernamesMissingVideos.length} remaining (attempt ${attempt}/${MAX_INFLUENCER_RETRIES})`,
            });
            for (
              let i = 0;
              i < usernamesMissingVideos.length;
              i += BATCH_SIZE
            ) {
              const batch = usernamesMissingVideos.slice(i, i + BATCH_SIZE);
              const retryItems = await runApifyForUsernames(batch, videoCount);
              mergeItemsIntoInfluencerMap(retryItems);
            }

            if (attempt < MAX_INFLUENCER_RETRIES) {
              await sleep(RETRY_BACKOFF_MS * attempt);
            }
          }

          for (const data of influencerMap.values()) {
            data.videos = dedupeAndLimitVideos(data.videos, videoCount);
          }

          /** Merge channel from all items so we don't miss link/bio when actor puts them on a different item than the first. */
          function mergedChannel(items: ApifyItem[]): Record<string, unknown> {
            const out: Record<string, unknown> = {};
            for (const item of items) {
              const ch = item.channel ?? {};
              for (const [k, v] of Object.entries(ch)) {
                if (v != null && v !== "" && out[k] == null) out[k] = v;
              }
            }
            return out;
          }

          const totalToProcess = influencerMap.size;
          let processedCount = 0;
          let totalVideosWritten = 0;
          const debugScrape = process.env.DEBUG_SCRAPE === "1";

          for (const [username, data] of influencerMap) {
            const allItems = data.profile
              ? [data.profile, ...data.videos]
              : [...data.videos];
            const channel = mergedChannel(allItems) as ApifyChannel;
            const bio = channel.bio ?? channel.signature ?? null;
            const avatarUrl = channel.avatar ?? channel.profilePicture ?? null;

            const email = channel.email ?? extractEmail(bio);
            const phone = channel.phone ?? extractPhone(bio);
            const linkCandidates: (string | null | undefined)[] = [
              channel.bioLinkUrl,
              channel.link,
              typeof channel.bioLink === "string"
                ? channel.bioLink
                : channel.bioLink?.url,
              channel.website,
              channel.linkInBio,
              channel.profileLink,
              channel.externalLink,
            ];
            let rawBioLink: string | null = null;
            for (const v of linkCandidates) {
              const normalized = normalizeUrlCandidate(v);
              if (normalized && !isTiktokProfileUrl(normalized)) {
                rawBioLink = normalized;
                break;
              }
            }
            if (!rawBioLink && typeof channel === "object") {
              for (const [k, v] of Object.entries(channel)) {
                const normalized =
                  typeof v === "string" ? normalizeUrlCandidate(v) : null;
                if (
                  normalized &&
                  !isTiktokProfileUrl(normalized) &&
                  (k.toLowerCase().includes("link") ||
                    k.toLowerCase().includes("url") ||
                    k.toLowerCase().includes("website"))
                ) {
                  rawBioLink = normalized;
                  break;
                }
              }
            }
            const bioLinkUrl = rawBioLink ?? extractUrlFromBio(bio);
            const socialLinks = normalizeSocialLinks(channel.socialLinks, bio);
            const storedAvatarUrl = avatarUrl;

            if (debugScrape && processedCount < 3) {
              const debugPayload = {
                username,
                channelKeys: Object.keys(channel),
                bio: bio ? `${bio.slice(0, 120)}` : null,
                rawBioLink,
                fromBio: extractUrlFromBio(bio),
                bioLinkUrl,
              };
              console.log(
                "[scrape] channel sample for",
                username,
                debugPayload,
              );
              send({ type: "debug", ...debugPayload });
            }

            const isSkippedProfileOnly = setSkipped.has(username);

            const influencer = await prisma.influencer.upsert({
              where: { username },
              create: {
                username,
                profileUrl: channel.url ?? null,
                avatarUrl: storedAvatarUrl,
                biolink: bio,
                bioLinkUrl,
                followers: channel.followers ?? null,
                email,
                phone,
                socialLinks,
                sourceFilename,
                importId,
              },
              update: {
                profileUrl: channel.url ?? null,
                avatarUrl: storedAvatarUrl,
                biolink: bio,
                bioLinkUrl,
                followers: channel.followers ?? null,
                email,
                phone,
                socialLinks,
                sourceFilename,
                importId,
              },
            });

            // For "skipped" users we only refresh profile/contact; do not touch videos
            if (!isSkippedProfileOnly) {
              const videoData = await Promise.all(
                data.videos.map(async (v) => {
                  const thumbnailUrl = v.video?.cover ?? null;

                  return {
                    influencerId: influencer.id,
                    username,
                    title: v.title ?? null,
                    views: v.views ?? null,
                    bookmarks: v.bookmarks ?? null,
                    uploadedAt: v.uploadedAtFormatted
                      ? new Date(v.uploadedAtFormatted)
                      : null,
                    thumbnailUrl,
                  };
                }),
              );

              const isRescrape = setRescrape.has(username);

              if (isRescrape) {
                const existingVideos = await prisma.video.findMany({
                  where: { influencerId: influencer.id },
                  select: {
                    id: true,
                    title: true,
                    uploadedAt: true,
                    thumbnailUrl: true,
                  },
                });
                const incomingByKey = new Map(
                  videoData.map((v) => [
                    `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`,
                    v,
                  ]),
                );
                const existingSet = new Set(
                  existingVideos.map(
                    (v) =>
                      `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`,
                  ),
                );

                // Refresh thumbnails for already-existing videos so old expiring TikTok URLs
                // get replaced with current (GCS-cached) URLs even when no new slots are available.
                const thumbUpdates = existingVideos
                  .map((v) => {
                    const key = `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`;
                    const incoming = incomingByKey.get(key);
                    if (!incoming?.thumbnailUrl) return null;
                    if (incoming.thumbnailUrl === v.thumbnailUrl) return null;
                    return { id: v.id, thumbnailUrl: incoming.thumbnailUrl };
                  })
                  .filter(
                    (u): u is { id: string; thumbnailUrl: string } =>
                      u !== null,
                  );

                if (thumbUpdates.length > 0) {
                  await prisma.$transaction(
                    thumbUpdates.map((u) =>
                      prisma.video.update({
                        where: { id: u.id },
                        data: { thumbnailUrl: u.thumbnailUrl },
                      }),
                    ),
                  );
                }

                const newVideos = videoData.filter(
                  (v) =>
                    !existingSet.has(
                      `${v.title ?? ""}|${v.uploadedAt?.toISOString() ?? ""}`,
                    ),
                );
                const slotsAvailable = videoCount - existingVideos.length;
                const toInsert = newVideos.slice(
                  0,
                  Math.max(0, slotsAvailable),
                );
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
            }

            processedCount++;
            send({
              type: "progress",
              processed: processedCount,
              total: totalToProcess,
              username,
            });
          }

          const skippedNotRescraped = refreshSkippedProfiles
            ? 0
            : skipped.length;
          await prisma.import.update({
            where: { id: importId! },
            data: {
              status: "DRAFT",
              processedCount: processedCount + skippedNotRescraped,
            },
          });

          send({
            type: "complete",
            processedCount: processedCount + skippedNotRescraped,
            totalVideos: totalVideosWritten,
            skipped: skippedNotRescraped,
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
