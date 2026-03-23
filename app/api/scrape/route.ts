import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../lib/prisma";
import { logApiUsage } from "../../lib/usage-tracking";
// ELD (Efficient Language Detector) — NLP-based, neural n-gram detector, 60 languages
// Loaded lazily since it needs async init
let _eld: typeof import("eld").default | null = null;
async function getEld() {
  if (!_eld) {
    const mod = await import("eld");
    _eld = mod.default ?? mod;
    await (_eld as { load?: (name: string) => Promise<boolean> }).load?.("large");
  }
  return _eld;
}

const APIFY_API_KEY = process.env.APIFY_API_KEY!;
const APIFY_ACTOR_ID = "ssOXktOBaQQiYfhc4"; // Video scraper
const APIFY_PROFILE_ACTOR_ID = "BW7peEX6cuzdpgpam"; // xtdata profile scraper (returns bio_url, signature_language, ins_id, etc.)
const BATCH_SIZE = 100;
const PROFILE_BATCH_SIZE = 50; // Smaller batches for profile enrichment
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
  bioLink?: string | { link?: string; url?: string; risk?: number };
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

/** xtdata profile scraper returns TikTok's raw internal API format */
interface ApifyProfileResult {
  // Identity
  unique_id?: string;       // username (e.g. "charlidamelio")
  nickname?: string;        // display name
  uid?: string;             // TikTok user ID
  sec_uid?: string;

  // Bio & links
  signature?: string;       // bio text
  bio_url?: string;         // THE EXTERNAL LINK (linktree, youtube, etc.)
  bio_secure_url?: string;  // TikTok safety-wrapped version of bio_url
  signature_language?: string; // detected language of bio (e.g. "en")

  // Social cross-links
  ins_id?: string;          // Instagram handle
  twitter_id?: string;      // Twitter/X handle
  twitter_name?: string;
  youtube_channel_id?: string;
  youtube_channel_title?: string;

  // Stats
  follower_count?: number;
  following_count?: number;
  total_favorited?: number; // total likes received
  aweme_count?: number;     // total videos
  favoriting_count?: number;

  // Profile metadata
  category?: string;        // e.g. "Public Figure", "Creator"
  verification_type?: number;
  custom_verify?: string;   // e.g. "verified account"

  // Avatar
  avatar_larger?: { url_list?: string[] };
  avatar_medium?: { url_list?: string[] };
  avatar_thumb?: { url_list?: string[] };

  // Catch-all for any other fields
  [key: string]: unknown;
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
  let transientFailures = 0;
  const MAX_TRANSIENT_RETRIES = 5;
  let runSucceeded = false;

  while (true) {
    if (Date.now() - pollStartedAt > MAX_APIFY_RUN_WAIT_MS) {
      console.warn(`[APIFY] Run timed out after ${MAX_APIFY_RUN_WAIT_MS}ms — skipping batch: ${usernames.join(", ")}`);
      return [];
    }
    await sleep(5000);
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      {
        headers: { Authorization: `Bearer ${APIFY_API_KEY}` },
      },
    );
    if (!statusRes.ok) {
      // Transient Apify errors (502, 503, 429) — retry up to 5 times then skip
      if (statusRes.status >= 500 || statusRes.status === 429) {
        transientFailures++;
        console.warn(`[APIFY] Transient error ${statusRes.status} (${statusRes.statusText}) — attempt ${transientFailures}/${MAX_TRANSIENT_RETRIES}`);
        if (transientFailures >= MAX_TRANSIENT_RETRIES) {
          console.warn(`[APIFY] Giving up after ${MAX_TRANSIENT_RETRIES} failures — skipping batch: ${usernames.join(", ")}`);
          return [];
        }
        await sleep(5000);
        continue;
      }
      console.warn(`[APIFY] Non-retryable error ${statusRes.status} (${statusRes.statusText}) — skipping batch: ${usernames.join(", ")}`);
      return [];
    }
    // Reset counter on successful poll
    transientFailures = 0;
    const statusData = await statusRes.json();
    const runStatus = statusData.data.status as string;

    if (runStatus === "SUCCEEDED") {
      runSucceeded = true;
      break;
    }
    if (
      runStatus === "FAILED" ||
      runStatus === "ABORTED" ||
      runStatus === "TIMED-OUT"
    ) {
      console.warn(`[APIFY] Run ${runStatus} — skipping batch: ${usernames.join(", ")}`);
      return [];
    }
  }

  if (!runSucceeded) return [];

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
    { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
  );
  if (!datasetRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${datasetRes.statusText}`);
  }
  return (await datasetRes.json()) as ApifyItem[];
}

/**
 * Run the Apify PROFILE scraper to get bio links, verified status, etc.
 * This is a separate actor that returns profile-level data (not videos).
 * Returns a Map of username → profile data.
 */
async function runApifyProfileScraper(
  usernames: string[],
): Promise<Map<string, ApifyProfileResult>> {
  console.log(`[PROFILE-SCRAPER] Starting profile scrape for ${usernames.length} usernames`);

  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_PROFILE_ACTOR_ID}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${APIFY_API_KEY}`,
      },
      body: JSON.stringify({
        usernames,
        maxItems: usernames.length,
      }),
    },
  );

  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => startRes.statusText);
    console.error(`[PROFILE-SCRAPER] Start failed: ${startRes.status} ${errText}`);
    throw new Error(`Profile scraper start failed: ${startRes.statusText}`);
  }

  const startData = await startRes.json();
  const runId = startData.data.id as string;
  console.log(`[PROFILE-SCRAPER] Run started: ${runId}`);

  const pollStartedAt = Date.now();
  while (true) {
    if (Date.now() - pollStartedAt > MAX_APIFY_RUN_WAIT_MS) {
      throw new Error(`Profile scraper timed out after ${MAX_APIFY_RUN_WAIT_MS}ms`);
    }
    await sleep(5000);
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
    );
    if (!statusRes.ok) {
      throw new Error(`Profile scraper status check failed: ${statusRes.statusText}`);
    }
    const statusData = await statusRes.json();
    const runStatus = statusData.data.status as string;

    if (runStatus === "SUCCEEDED") break;
    if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
      throw new Error(`Profile scraper run ${runStatus}`);
    }
  }

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
    { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
  );
  if (!datasetRes.ok) {
    throw new Error(`Profile scraper dataset fetch failed: ${datasetRes.statusText}`);
  }
  const items = (await datasetRes.json()) as ApifyProfileResult[];
  console.log(`[PROFILE-SCRAPER] Got ${items.length} profile results`);

  // Log the first item's full structure for debugging
  if (items.length > 0) {
    console.log(`[PROFILE-SCRAPER] First item keys:`, Object.keys(items[0]));
    console.log(`[PROFILE-SCRAPER] First item FULL:`, JSON.stringify(items[0], null, 2).slice(0, 3000));
  }

  // Build map by username (xtdata uses unique_id for username)
  const map = new Map<string, ApifyProfileResult>();
  for (const item of items) {
    const username = normalizeUsername(item.unique_id) ?? normalizeUsername(item.nickname);
    if (username) {
      map.set(username, item);
    }
  }

  console.log(`[PROFILE-SCRAPER] Mapped ${map.size} profiles by username`);
  return map;
}

/** Map of common TikTok account languages to likely countries */
const LANGUAGE_TO_COUNTRY: Record<string, string> = {
  ko: "KR", ja: "JP", th: "TH", id: "ID", vi: "VN",
  zh: "CN", "zh-Hans": "CN", "zh-Hant": "TW",
  ms: "MY", tl: "PH", fil: "PH",
  hi: "IN", bn: "BD", ta: "IN", te: "IN",
  tr: "TR", ru: "RU", uk: "UA", pl: "PL",
  de: "DE", fr: "FR", it: "IT", es: "ES", pt: "BR", "pt-BR": "BR",
  ar: "SA", he: "IL", fa: "IR",
  sv: "SE", da: "DK", nb: "NO", fi: "FI", nl: "NL",
  ro: "RO", el: "GR", cs: "CZ", hu: "HU",
};


/**
 * Extract bio link URL from the xtdata profile scraper result.
 * The xtdata actor returns TikTok's raw internal API format with bio_url field.
 */
function extractBioLinkFromProfile(profile: ApifyProfileResult): string | null {
  // Primary: bio_url is THE external link on TikTok profile (linktree, youtube, etc.)
  if (typeof profile.bio_url === "string" && profile.bio_url.trim()) {
    const norm = normalizeUrlCandidate(profile.bio_url);
    if (norm && !isTiktokProfileUrl(norm)) {
      console.log(`[PROFILE-SCRAPER] Got bio_url:`, norm);
      return norm;
    }
  }

  // Fallback: bio_secure_url (TikTok's safety-wrapped redirect URL — extract the target)
  if (typeof profile.bio_secure_url === "string" && profile.bio_secure_url.trim()) {
    try {
      const parsed = new URL(profile.bio_secure_url);
      const target = parsed.searchParams.get("target");
      if (target) {
        const decoded = decodeURIComponent(target);
        const norm = normalizeUrlCandidate(decoded);
        if (norm && !isTiktokProfileUrl(norm)) {
          console.log(`[PROFILE-SCRAPER] Extracted from bio_secure_url target:`, norm);
          return norm;
        }
      }
    } catch {
      // If URL parsing fails, try using bio_secure_url directly
      const norm = normalizeUrlCandidate(profile.bio_secure_url);
      if (norm && !isTiktokProfileUrl(norm)) return norm;
    }
  }

  // Scan all string properties for any link-like fields we might have missed
  for (const [k, v] of Object.entries(profile)) {
    if (typeof v === "string" && v.trim()) {
      const kLower = k.toLowerCase();
      if (
        (kLower.includes("link") || kLower.includes("url") || kLower.includes("website")) &&
        !kLower.includes("avatar") && !kLower.includes("secure") && !kLower.includes("share")
      ) {
        const norm = normalizeUrlCandidate(v);
        if (norm && !isTiktokProfileUrl(norm)) {
          console.log(`[PROFILE-SCRAPER] Found link in field ${k}:`, norm);
          return norm;
        }
      }
    }
  }

  // Last resort: extract from bio text
  return extractUrlFromBio(profile.signature);
}

/**
 * Extract additional profile data from xtdata scraper result.
 * Returns social links (Instagram, Twitter, YouTube) and language.
 */
// ── LANGUAGE DETECTION (NLP-based using ELD — Efficient Language Detector) ──
// Uses neural n-gram analysis. 60 languages. Proven to beat CLD3 and franc in accuracy.
// We ONLY use the 3 most recent video captions — NOT the bio (too noisy/short).
// Voting: majority of 3 videos wins. English → null (we skip English).

/**
 * Detect language from a single text using ELD (Efficient Language Detector).
 * Returns ISO 639-1 lang code or null. English returns null (skipped).
 */
async function detectLanguageFromText(text: string | null | undefined): Promise<string | null> {
  if (!text || text.trim().length < 10) return null;
  const eld = await getEld();
  const result = (eld as { detect: (t: string) => { language: string; isReliable: () => boolean } }).detect(text.trim());
  if (!result || !result.language || !result.isReliable()) return null;
  // Skip English — we only tag non-English creators
  if (result.language === "en") return null;
  return result.language;
}

/**
 * Detect the dominant language for an influencer using ONLY the 3 most recent video
 * captions/titles. Bio is ignored (too short, noisy, often in English even for
 * non-English creators). Voting: each of the 3 videos votes, majority wins.
 * Requires at least 2/3 agreement for confidence.
 */
async function detectInfluencerLanguage(
  videoTitles: string[],
): Promise<string | null> {
  // Only use the first 3 (most recent) videos
  const recentTitles = videoTitles.slice(0, 3);
  if (recentTitles.length === 0) return null;

  const detections: (string | null)[] = [];
  for (const title of recentTitles) {
    const lang = await detectLanguageFromText(title);
    detections.push(lang);
  }

  // Count votes (ignore nulls — those are English or too-short)
  const votes: Record<string, number> = {};
  for (const lang of detections) {
    if (lang) votes[lang] = (votes[lang] ?? 0) + 1;
  }

  if (Object.keys(votes).length === 0) return null;

  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const [topLang, topCount] = sorted[0];

  console.log(`[LANG-DETECT] Video detections: [${detections.join(", ")}] → votes: ${sorted.map(([l, c]) => `${l}=${c}`).join(", ")}`);

  // Require at least 2 votes for the winning language (2/3 majority)
  if (topCount < 2) {
    console.log(`[LANG-DETECT] No majority (top=${topCount}), skipping`);
    return null;
  }

  return topLang;
}

function extractProfileExtras(profile: ApifyProfileResult): {
  instagramHandle: string | null;
  twitterHandle: string | null;
  youtubeChannel: string | null;
  category: string | null;
} {
  // Language detection is now handled by detectInfluencerLanguage() using video captions only.
  return {
    instagramHandle: profile.ins_id && profile.ins_id.trim() ? profile.ins_id.trim() : null,
    twitterHandle: profile.twitter_id && profile.twitter_id.trim() ? profile.twitter_id.trim() : null,
    youtubeChannel: profile.youtube_channel_id
      ? `https://youtube.com/channel/${profile.youtube_channel_id}`
      : profile.youtube_channel_title
        ? `https://youtube.com/@${profile.youtube_channel_title}`
        : null,
    category: profile.category ?? null,
  };
}

/**
 * Detect estimated region from TikTok CDN URL patterns.
 * TikTok CDN domains and path prefixes leak the user's registered region.
 *
 * Patterns found:
 *   Domain: tiktokcdn-us.com → Americas | tiktokcdn-eu.com → Europe | tiktokcdn.com + sign-sg → Asia
 *   Path:   tos-useast* → Americas | tos-alisg → Asia/SEA | tos-maliva → Global CDN (ambiguous)
 */
function detectRegionFromCdn(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const lower = url.toLowerCase();

  // 1. Domain-level detection (most reliable)
  if (lower.includes("tiktokcdn-us.com")) return "Americas";
  if (lower.includes("tiktokcdn-eu.com")) return "Europe";

  // 2. Subdomain hints
  if (lower.includes("sign-sg.tiktokcdn")) return "Asia";
  if (lower.includes("sign-va.tiktokcdn")) return "Americas"; // VA = Virginia

  // 3. Object storage prefix (tos-*)
  if (lower.includes("tos-useast")) return "Americas";
  if (lower.includes("tos-alisg")) return "Asia";     // alisg = Alibaba Singapore
  if (lower.includes("tos-uswest")) return "Americas";
  if (lower.includes("tos-eu")) return "Europe";

  // tos-maliva is TikTok's global/default CDN — not region-specific
  return null;
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
    /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s\])]*)?$/i.test(trimmed)
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
    /https?:\/\/[^\s\])]+|www\.[^\s\])]+|[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s\])]*)?/gi,
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
      runAnalysis = false,
    } = body as {
      importId: string;
      toScrape?: string[];
      toRescrape?: string[];
      skipped?: string[];
      videoCount?: number;
      refreshSkippedProfiles?: boolean;
      runAnalysis?: boolean;
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
        const scrapeStartedAt = Date.now();
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

            // ── RAW APIFY RESPONSE DEBUG ──
            // Log the first item's FULL channel object to see all fields Apify returns
            if (i === 0 && items.length > 0) {
              const sampleItem = items[0];
              console.log(`\n[APIFY-RAW-DEBUG] ━━━ First raw item from Apify ━━━`);
              console.log(`[APIFY-RAW-DEBUG] Top-level keys:`, Object.keys(sampleItem));
              if (sampleItem.channel) {
                console.log(`[APIFY-RAW-DEBUG] channel keys:`, Object.keys(sampleItem.channel));
                console.log(`[APIFY-RAW-DEBUG] channel FULL object:`, JSON.stringify(sampleItem.channel, null, 2));
              } else {
                console.log(`[APIFY-RAW-DEBUG] WARNING: No 'channel' key! Full item keys:`, Object.keys(sampleItem));
                console.log(`[APIFY-RAW-DEBUG] Full first item:`, JSON.stringify(sampleItem, null, 2).slice(0, 3000));
              }
              // Also log 2nd and 3rd items if they have different channel structures
              for (let si = 1; si < Math.min(3, items.length); si++) {
                const otherItem = items[si];
                const otherUsername = normalizeUsername(otherItem.channel?.username);
                if (otherUsername && otherItem.channel) {
                  console.log(`[APIFY-RAW-DEBUG] Item #${si + 1} (@${otherUsername}) channel keys:`, Object.keys(otherItem.channel));
                }
              }
              send({
                type: "apify_raw_debug",
                topLevelKeys: Object.keys(sampleItem),
                channelKeys: sampleItem.channel ? Object.keys(sampleItem.channel) : [],
                channelFull: sampleItem.channel ?? null,
                totalItems: items.length,
              });
            }
            // ── END RAW APIFY DEBUG ──

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

          // ── PROFILE ENRICHMENT: Run profile scraper to get bioLink data ──
          // The video scraper often doesn't return bioLink, so we use a dedicated profile scraper
          let profileDataMap = new Map<string, ApifyProfileResult>();
          try {
            send({
              type: "stage",
              message: `Enriching profiles for ${normalizedTargetUsernames.length} influencers (fetching bio links)...`,
            });
            for (
              let i = 0;
              i < normalizedTargetUsernames.length;
              i += PROFILE_BATCH_SIZE
            ) {
              const batch = normalizedTargetUsernames.slice(i, i + PROFILE_BATCH_SIZE);
              const batchMap = await runApifyProfileScraper(batch);
              for (const [k, v] of batchMap) {
                profileDataMap.set(k, v);
              }
              if (i + PROFILE_BATCH_SIZE < normalizedTargetUsernames.length) {
                send({
                  type: "stage",
                  message: `Enriching profiles... (${Math.min(i + PROFILE_BATCH_SIZE, normalizedTargetUsernames.length)}/${normalizedTargetUsernames.length})`,
                });
              }
            }
            console.log(`[PROFILE-SCRAPER] Total enriched profiles: ${profileDataMap.size}/${normalizedTargetUsernames.length}`);
            send({
              type: "stage",
              message: `Profile enrichment complete. Got bio data for ${profileDataMap.size} influencers.`,
            });
          } catch (profileErr) {
            // Don't fail the whole scrape if profile enrichment fails — just log and continue
            console.error(`[PROFILE-SCRAPER] Profile enrichment failed, continuing without:`, profileErr);
            send({
              type: "stage",
              message: `Profile enrichment failed (${profileErr instanceof Error ? profileErr.message : "unknown error"}). Continuing with video data only...`,
            });
            profileDataMap = new Map();
          }
          // ── END PROFILE ENRICHMENT ──

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

          for (const [username, data] of influencerMap) {
            const allItems = data.profile
              ? [data.profile, ...data.videos]
              : [...data.videos];
            const channel = mergedChannel(allItems) as ApifyChannel;
            const bio = channel.bio ?? channel.signature ?? null;
            const avatarUrl = channel.avatar ?? channel.profilePicture ?? null;

            // ── BIOLINK DEBUG: Log ALL channel keys and any link-like values ──
            const channelRecord = channel as unknown as Record<string, unknown>;
            const allChannelKeys = Object.keys(channelRecord);
            const linkRelatedFields: Record<string, unknown> = {};
            const urlLikeFields: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(channelRecord)) {
              const kLower = k.toLowerCase();
              if (
                kLower.includes("link") ||
                kLower.includes("url") ||
                kLower.includes("website") ||
                kLower.includes("bio") ||
                kLower.includes("homepage") ||
                kLower.includes("external") ||
                kLower.includes("href")
              ) {
                linkRelatedFields[k] = v;
              }
              // Also catch any string value that looks like a URL
              if (
                typeof v === "string" &&
                (v.startsWith("http") || v.includes(".com") || v.includes(".link") || v.includes("linktr") || v.includes("beacons"))
              ) {
                urlLikeFields[k] = v;
              }
              // Check nested objects for URLs
              if (v && typeof v === "object" && !Array.isArray(v)) {
                for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
                  if (typeof nv === "string" && (nv.startsWith("http") || nv.includes(".com"))) {
                    urlLikeFields[`${k}.${nk}`] = nv;
                  }
                }
              }
            }
            console.log(`\n[BIOLINK-DEBUG] ━━━ @${username} ━━━`);
            console.log(`[BIOLINK-DEBUG] All channel keys (${allChannelKeys.length}):`, allChannelKeys);
            console.log(`[BIOLINK-DEBUG] Link-related fields:`, JSON.stringify(linkRelatedFields, null, 2));
            console.log(`[BIOLINK-DEBUG] URL-like values found:`, JSON.stringify(urlLikeFields, null, 2));
            console.log(`[BIOLINK-DEBUG] Raw bio text:`, bio ? bio.slice(0, 300) : "(empty)");
            // ── END BIOLINK DEBUG ──

            const email = channel.email ?? extractEmail(bio);
            const phone = channel.phone ?? extractPhone(bio);
            // Extract bioLink — TikTok returns { link: "...", risk: 0 }, some actors return string or { url: "..." }
            console.log(`[BIOLINK-DEBUG] channel.bioLink raw value:`, JSON.stringify(channel.bioLink));
            console.log(`[BIOLINK-DEBUG] channel.bioLink type:`, typeof channel.bioLink);
            const bioLinkResolved =
              typeof channel.bioLink === "string"
                ? channel.bioLink
                : channel.bioLink?.link ?? channel.bioLink?.url ?? null;
            console.log(`[BIOLINK-DEBUG] bioLinkResolved:`, bioLinkResolved);

            const linkCandidates: (string | null | undefined)[] = [
              bioLinkResolved,          // bioLink.link (TikTok native format) — HIGHEST PRIORITY
              channel.bioLinkUrl,
              channel.link,
              channel.website,
              channel.linkInBio,
              channel.profileLink,
              channel.externalLink,
            ];

            // ── DEBUG: Log each candidate and why it was accepted/rejected ──
            console.log(`[BIOLINK-DEBUG] Link candidates (in priority order):`);
            const candidateNames = ["bioLink(.link/.url)", "bioLinkUrl", "link", "website", "linkInBio", "profileLink", "externalLink"];
            for (let ci = 0; ci < linkCandidates.length; ci++) {
              const raw = linkCandidates[ci];
              const normalized = normalizeUrlCandidate(raw as string);
              const isTikTok = normalized ? isTiktokProfileUrl(normalized) : false;
              console.log(`[BIOLINK-DEBUG]   ${candidateNames[ci]}: raw=${JSON.stringify(raw)} → normalized=${normalized} → isTikTok=${isTikTok}`);
            }

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
                let candidate: string | null = null;
                if (typeof v === "string") {
                  candidate = normalizeUrlCandidate(v);
                } else if (v && typeof v === "object" && !Array.isArray(v)) {
                  // Handle nested objects like bioLink: { link: "...", risk: 0 }
                  const nested = v as Record<string, unknown>;
                  const nestedUrl = nested.link ?? nested.url ?? nested.href ?? null;
                  if (typeof nestedUrl === "string") {
                    candidate = normalizeUrlCandidate(nestedUrl);
                  }
                }
                if (
                  candidate &&
                  !isTiktokProfileUrl(candidate) &&
                  (k.toLowerCase().includes("link") ||
                    k.toLowerCase().includes("url") ||
                    k.toLowerCase().includes("website"))
                ) {
                  rawBioLink = candidate;
                  console.log(`[BIOLINK-DEBUG]   Fallback match from channel.${k}:`, candidate);
                  break;
                }
              }
            }
            const bioFromText = extractUrlFromBio(bio);
            const videoScraperBioLink = rawBioLink ?? bioFromText;

            // ── PROFILE SCRAPER ENRICHMENT: Use xtdata profile scraper as highest priority ──
            const profileData = profileDataMap.get(username);
            let profileScraperBioLink: string | null = null;
            let profileExtras: ReturnType<typeof extractProfileExtras> | null = null;
            if (profileData) {
              profileScraperBioLink = extractBioLinkFromProfile(profileData);
              profileExtras = extractProfileExtras(profileData);
              console.log(`[BIOLINK-DEBUG] Profile scraper data for @${username}:`, {
                bio_url: profileData.bio_url,
                bio_secure_url: profileData.bio_secure_url,
                signature_language: profileData.signature_language,
                region: profileData.region,
                ins_id: profileData.ins_id,
                twitter_id: profileData.twitter_id,
                youtube_channel_id: profileData.youtube_channel_id,
                extracted_bioLink: profileScraperBioLink,
                extras: profileExtras,
              });
            } else {
              console.log(`[BIOLINK-DEBUG] No profile scraper data for @${username}`);
            }

            // Priority: profile scraper > video scraper channel > bio text parsing
            const bioLinkUrl = profileScraperBioLink ?? videoScraperBioLink;
            const bioLinkSource = profileScraperBioLink
              ? "profile_scraper"
              : rawBioLink
                ? "video_scraper_channel"
                : bioFromText
                  ? "bio_text_parse"
                  : "none";
            console.log(`[BIOLINK-DEBUG] RESULT: source=${bioLinkSource} | profileScraper=${profileScraperBioLink} | videoScraper=${videoScraperBioLink} | FINAL bioLinkUrl=${bioLinkUrl}`);
            // ── END PROFILE ENRICHMENT ──

            // Merge social links from video scraper + profile scraper (Instagram, Twitter, YouTube)
            let socialLinks = normalizeSocialLinks(channel.socialLinks, bio);
            if (profileExtras) {
              const extraLinks: string[] = [];
              if (profileExtras.instagramHandle) extraLinks.push(`https://instagram.com/${profileExtras.instagramHandle}`);
              if (profileExtras.twitterHandle) extraLinks.push(`https://x.com/${profileExtras.twitterHandle}`);
              if (profileExtras.youtubeChannel) extraLinks.push(profileExtras.youtubeChannel);
              if (extraLinks.length > 0) {
                const existing: string[] = socialLinks ? JSON.parse(socialLinks) : [];
                const seen = new Set(existing.map(u => u.toLowerCase().replace(/\/+$/, "")));
                for (const u of extraLinks) {
                  const n = u.toLowerCase().replace(/\/+$/, "");
                  if (!seen.has(n)) {
                    seen.add(n);
                    existing.push(u);
                  }
                }
                socialLinks = JSON.stringify(existing);
              }
            }
            const storedAvatarUrl = avatarUrl;

            // Send debug info to frontend SSE stream as well
            send({
              type: "biolink_debug",
              username,
              channelKeys: allChannelKeys,
              linkRelatedFields,
              urlLikeFields,
              bio: bio ? bio.slice(0, 300) : null,
              bioLinkUrl,
              rawBioLink: videoScraperBioLink,
              profileScraperBioLink,
              bioLinkSource,
              fromBioText: bioFromText,
            });

            const isSkippedProfileOnly = setSkipped.has(username);

            // Language detection: ELD NLP on 3 most recent video captions (ignores bio)
            const videoTitles: string[] = (data.videos ?? [])
              .map((v) => (typeof v.title === "string" ? v.title : ""))
              .filter((t) => t.length > 0);
            const resolvedLanguage = await detectInfluencerLanguage(videoTitles);

            // Region/Country detection: CDN URL analysis (free!) + language inference
            const cdnRegion = detectRegionFromCdn(avatarUrl);
            // Also check xtdata avatar URLs for more CDN hints
            const xtdataAvatarUrl = profileData?.avatar_larger?.url_list?.[0]
              ?? profileData?.avatar_medium?.url_list?.[0] ?? null;
            const xtdaCdnRegion = detectRegionFromCdn(xtdataAvatarUrl);
            const estimatedRegion = xtdaCdnRegion || cdnRegion || null;

            // Country: language mapping (for non-ambiguous languages) or CDN region
            const langCountry = resolvedLanguage ? LANGUAGE_TO_COUNTRY[resolvedLanguage] ?? null : null;
            // Build a combined country string: e.g. "KR" from language, or "Americas" from CDN
            const resolvedCountry = langCountry || estimatedRegion || null;

            console.log(`[LANG-DETECT] @${username}: lang=${resolvedLanguage} (from top 3 of ${videoTitles.length} video captions)`);
            console.log(`[REGION-DETECT] @${username}: cdnRegion=${cdnRegion} | xtdaCdn=${xtdaCdnRegion} | langCountry=${langCountry} | FINAL=${resolvedCountry}`);

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
                language: resolvedLanguage,
                country: resolvedCountry,
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
                language: resolvedLanguage,
                ...(resolvedCountry ? { country: resolvedCountry } : {}),
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

          // Log API usage for this import
          logApiUsage({
            service: "apify_video",
            action: "scrape_videos",
            importId: importId!,
            inputCount: processedCount + skippedNotRescraped,
            outputCount: totalVideosWritten,
            durationMs: Date.now() - scrapeStartedAt,
            status: "success",
          });

          send({
            type: "complete",
            processedCount: processedCount + skippedNotRescraped,
            totalVideos: totalVideosWritten,
            skipped: skippedNotRescraped,
          });

          // If audience analysis was requested, fire off analytics runs for each influencer
          if (runAnalysis && importId) {
            try {
              const influencers = await prisma.influencer.findMany({
                where: { importId },
                select: { id: true },
              });
              for (const inf of influencers) {
                // Fire-and-forget: trigger analytics pipeline via internal API
                fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/analytics/run`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ influencerId: inf.id }),
                }).catch(() => {});
              }
            } catch (e) {
              console.error("[Scrape] Failed to trigger analytics runs:", e);
            }
          }
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
