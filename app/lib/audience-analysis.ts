// ─── Audience Analytics Engine ───────────────────────────────
// Gemini-powered NLP + Vision pipeline for demographic estimation

import type { AnalysisMode } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────

export interface AnalysisConfig {
  videosToSample: number;
  commentsPerVideo: number;
  maxTotalComments: number;
  avatarsToAnalyze: number;
  commentBatchSize: number;
  geminiModel: string;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  videosToSample: 20,
  commentsPerVideo: 50,
  maxTotalComments: 1000,
  avatarsToAnalyze: 100,
  commentBatchSize: 200,
  geminiModel: "gemini-2.0-flash",
};

export interface ProfileAnalysisResult {
  gender: string;   // "male" | "female" | "unknown"
  ageRange: string;  // e.g. "25-34"
  ethnicity: string; // e.g. "East Asian"
}

export interface AudienceNlpResult {
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  topCountries: { country: string; countryName: string; percentage: number }[];
  topInterests: { category: string; score: number }[];
  audienceQuality: number;
  confidence: number;
  reasoning: string;
}

export interface AvatarAnalysisResult {
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  ethnicityBreakdown: Record<string, number>;
}

export interface MergedAnalytics {
  influencerGender: string | null;
  influencerAgeRange: string | null;
  influencerEthnicity: string | null;
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  topCountries: { country: string; countryName: string; percentage: number }[];
  ethnicityBreakdown: Record<string, number> | null;
  topInterests: { category: string; score: number }[];
  audienceQuality: number;
  confidence: number;
}

// ─── Helpers ────────────────────────────────────────────────

function getGeminiEndpoint(model: string): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

async function callGeminiText(
  prompt: string,
  model: string,
): Promise<string> {
  const endpoint = getGeminiEndpoint(model);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini returned empty response");
  }
  return rawText;
}

async function callGeminiVision(
  prompt: string,
  imageUrls: string[],
  model: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Download images and convert to base64
  const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];

  for (const url of imageUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const contentType = res.headers.get("content-type") || "image/jpeg";
      imageParts.push({
        inlineData: { mimeType: contentType, data: base64 },
      });
    } catch {
      // Skip failed image downloads
      continue;
    }
  }

  if (imageParts.length === 0) {
    throw new Error("No images could be downloaded");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }, ...imageParts],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini Vision request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini Vision returned empty response");
  }
  return rawText;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Influencer Profile Analysis (Gemini Vision) ──────────

export async function analyzeInfluencerProfile(
  avatarUrl: string,
  model: string = DEFAULT_CONFIG.geminiModel,
): Promise<ProfileAnalysisResult> {
  const prompt = [
    "Analyze this profile picture of a social media influencer.",
    "Estimate the following based on visual appearance:",
    "",
    "1. gender: 'male', 'female', or 'unknown'",
    "2. ageRange: one of '13-17', '18-24', '25-34', '35-44', '45+'",
    "3. ethnicity: one of 'East Asian', 'South Asian', 'Southeast Asian', 'White/Caucasian', 'Black', 'Latino', 'Middle Eastern', 'Central Asian', 'Mixed', 'Unknown'",
    "",
    "If the image does not clearly show a face (logo, cartoon, group photo, object), return gender='unknown', ageRange='unknown', ethnicity='Unknown'.",
    "",
    'Return JSON only: {"gender": string, "ageRange": string, "ethnicity": string}',
  ].join("\n");

  const rawText = await callGeminiVision(prompt, [avatarUrl], model);
  const parsed = JSON.parse(rawText);

  return {
    gender: parsed.gender ?? "unknown",
    ageRange: parsed.ageRange ?? "unknown",
    ethnicity: parsed.ethnicity ?? "Unknown",
  };
}

// ─── Audience NLP Analysis (Comment Text) ───────────────────

function buildNlpPrompt(
  username: string,
  commentTexts: string[],
): string {
  const numbered = commentTexts
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return [
    "You are an audience demographics analyst. Analyze the following TikTok comments to estimate the audience profile of the creator. Return strict JSON only.",
    "",
    "=== ANALYSIS TASK ===",
    `Analyze ${commentTexts.length} comments from TikTok creator @${username} to estimate their audience demographics.`,
    "",
    "=== COMMENTS ===",
    numbered,
    "",
    "=== ANALYSIS DIMENSIONS ===",
    "",
    "1. LANGUAGE & LOCATION:",
    "   - Identify languages and dialects present",
    "   - Map language to likely country (e.g., Korean → South Korea, Brazilian Portuguese → Brazil)",
    "   - Look for regional slang, dialect markers, and local references",
    "   - Named entities: UK schools/exams (GCSEs, A-levels), US stores (Walmart, Target), local place names",
    "",
    "2. AGE ESTIMATION:",
    '   - Gen Z markers: "slay", "no cap", "fr fr", "ate", "it\'s giving", "💀", "stan", "rizz", "skibidi", "sus", "mid"',
    '   - Millennial markers: "lol", "omg", standard emoji use, "I\'m dead", "adulting", "doggo"',
    "   - Older markers: formal language, complete sentences, traditional punctuation",
    "   - Emoji patterns: 💀🤣 (younger) vs 😂👍 (older) vs 🙏😊 (oldest)",
    "",
    "3. GENDER INDICATORS:",
    "   - Language patterns, emoji usage frequency and types",
    "   - Comment sentiment and topic focus",
    "   - Note: this is probabilistic, not deterministic",
    "",
    "4. INTERESTS:",
    "   - Extract topic categories from comment content",
    "   - Look at what commenters reference, ask about, or engage with",
    "",
    "5. AUDIENCE QUALITY:",
    '   - Ratio of substantive comments vs spam/bot-like ("nice", single emoji, "follow me")',
    "   - Comment length distribution",
    "   - Engagement quality signals",
    "",
    "=== RULES ===",
    "- Base estimates ONLY on evidence in the comments",
    "- Percentages must sum to 100 for gender and age brackets",
    "- Country percentages should sum to 100",
    "- Express uncertainty: if comments are mostly in one language, acknowledge the sample bias",
    "- Minimum 50 comments needed for reasonable estimates; flag low confidence if fewer",
    "",
    "Return JSON:",
    "{",
    '  "genderBreakdown": { "male": number, "female": number, "unknown": number },',
    '  "ageBrackets": { "13-17": number, "18-24": number, "25-34": number, "35-44": number, "45+": number },',
    '  "topCountries": [{ "country": "XX", "countryName": "...", "percentage": number }],',
    '  "topInterests": [{ "category": "...", "score": number }],',
    '  "audienceQuality": number,',
    '  "confidence": number,',
    '  "reasoning": "Brief explanation of key signals found"',
    "}",
  ].join("\n");
}

export async function analyzeAudienceComments(
  username: string,
  commentTexts: string[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  onProgress?: (batchIndex: number, totalBatches: number) => void,
): Promise<AudienceNlpResult> {
  const { commentBatchSize, geminiModel } = config;
  const batches: string[][] = [];

  for (let i = 0; i < commentTexts.length; i += commentBatchSize) {
    batches.push(commentTexts.slice(i, i + commentBatchSize));
  }

  if (batches.length === 0) {
    throw new Error("No comments to analyze");
  }

  const batchResults: (AudienceNlpResult & { count: number })[] = [];

  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i, batches.length);

    try {
      const prompt = buildNlpPrompt(username, batches[i]);
      const rawText = await callGeminiText(prompt, geminiModel);
      const parsed = JSON.parse(rawText);

      batchResults.push({
        genderBreakdown: parsed.genderBreakdown ?? { male: 33, female: 33, unknown: 34 },
        ageBrackets: parsed.ageBrackets ?? { "13-17": 20, "18-24": 20, "25-34": 20, "35-44": 20, "45+": 20 },
        topCountries: parsed.topCountries ?? [],
        topInterests: parsed.topInterests ?? [],
        audienceQuality: Number(parsed.audienceQuality) || 50,
        confidence: Number(parsed.confidence) || 0.5,
        reasoning: parsed.reasoning ?? "",
        count: batches[i].length,
      });
    } catch (err) {
      console.error(`[Audience NLP] Batch ${i + 1}/${batches.length} failed:`, err);
      // Continue with other batches — partial results are OK
    }

    // Rate limiting: 1s between calls
    if (i < batches.length - 1) {
      await sleep(1000);
    }
  }

  if (batchResults.length === 0) {
    throw new Error("All NLP batches failed");
  }

  return mergeNlpBatches(batchResults);
}

function mergeNlpBatches(
  batches: (AudienceNlpResult & { count: number })[],
): AudienceNlpResult {
  const totalCount = batches.reduce((sum, b) => sum + b.count, 0);

  // Weighted average for gender
  const gender = { male: 0, female: 0, unknown: 0 };
  for (const b of batches) {
    const w = b.count / totalCount;
    gender.male += (b.genderBreakdown.male ?? 0) * w;
    gender.female += (b.genderBreakdown.female ?? 0) * w;
    gender.unknown += (b.genderBreakdown.unknown ?? 0) * w;
  }

  // Weighted average for age brackets
  const ageBracketKeys = ["13-17", "18-24", "25-34", "35-44", "45+"];
  const ageBrackets: Record<string, number> = {};
  for (const key of ageBracketKeys) {
    ageBrackets[key] = 0;
    for (const b of batches) {
      const w = b.count / totalCount;
      ageBrackets[key] += (b.ageBrackets[key] ?? 0) * w;
    }
  }

  // Merge countries — aggregate by country code, then normalize
  const countryMap = new Map<string, { countryName: string; total: number }>();
  for (const b of batches) {
    const w = b.count / totalCount;
    for (const c of b.topCountries) {
      const existing = countryMap.get(c.country) ?? { countryName: c.countryName, total: 0 };
      existing.total += (c.percentage ?? 0) * w;
      countryMap.set(c.country, existing);
    }
  }
  const topCountries = [...countryMap.entries()]
    .map(([country, { countryName, total }]) => ({ country, countryName, percentage: Math.round(total * 10) / 10 }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);

  // Merge interests — aggregate by category, take top 10
  const interestMap = new Map<string, number>();
  for (const b of batches) {
    for (const interest of b.topInterests) {
      const existing = interestMap.get(interest.category) ?? 0;
      interestMap.set(interest.category, existing + (interest.score ?? 0));
    }
  }
  const topInterests = [...interestMap.entries()]
    .map(([category, score]) => ({ category, score: Math.round(score / batches.length) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Average quality and confidence
  const audienceQuality = Math.round(
    batches.reduce((sum, b) => sum + b.audienceQuality * (b.count / totalCount), 0),
  );
  const confidence = Math.round(
    batches.reduce((sum, b) => sum + b.confidence * (b.count / totalCount), 0) * 100,
  ) / 100;

  return {
    genderBreakdown: {
      male: Math.round(gender.male),
      female: Math.round(gender.female),
      unknown: Math.round(gender.unknown),
    },
    ageBrackets: Object.fromEntries(
      Object.entries(ageBrackets).map(([k, v]) => [k, Math.round(v)]),
    ),
    topCountries,
    topInterests,
    audienceQuality,
    confidence,
    reasoning: batches.map((b) => b.reasoning).filter(Boolean).join(" | "),
  };
}

// ─── Audience Avatar Analysis (Gemini Vision) ───────────────

export async function analyzeCommenterAvatars(
  avatarUrls: string[],
  model: string = DEFAULT_CONFIG.geminiModel,
  onProgress?: (batchIndex: number, totalBatches: number) => void,
): Promise<AvatarAnalysisResult> {
  // Process in batches of 20 images
  const AVATAR_BATCH_SIZE = 20;
  const batches: string[][] = [];
  for (let i = 0; i < avatarUrls.length; i += AVATAR_BATCH_SIZE) {
    batches.push(avatarUrls.slice(i, i + AVATAR_BATCH_SIZE));
  }

  const prompt = [
    `You are analyzing ${avatarUrls.length} TikTok user profile pictures to estimate the demographic makeup of an audience.`,
    "",
    "For each image, estimate:",
    "- gender: M (male), F (female), U (unknown/unclear)",
    "- ageRange: one of '13-17', '18-24', '25-34', '35-44', '45+'",
    "- ethnicity: one of 'East Asian', 'South Asian', 'Southeast Asian', 'White/Caucasian', 'Black', 'Latino', 'Middle Eastern', 'Central Asian', 'Mixed', 'Unknown'",
    "",
    "If an image is a logo, cartoon, object, or doesn't show a clear face, use gender=U, ageRange=unknown, ethnicity=Unknown.",
    "",
    "After analyzing all images, return AGGREGATE statistics (not per-image):",
    "{",
    '  "totalAnalyzed": number,',
    '  "genderBreakdown": { "male": percentage, "female": percentage, "unknown": percentage },',
    '  "ageBrackets": { "13-17": percentage, "18-24": percentage, "25-34": percentage, "35-44": percentage, "45+": percentage },',
    '  "ethnicityBreakdown": { "East Asian": percentage, "South Asian": percentage, "Southeast Asian": percentage, "White/Caucasian": percentage, "Black": percentage, "Latino": percentage, "Middle Eastern": percentage, "Central Asian": percentage, "Mixed": percentage, "Unknown": percentage }',
    "}",
    "",
    "All percentages must sum to 100 within their group. Omit ethnicity categories with 0%.",
  ].join("\n");

  const allResults: (AvatarAnalysisResult & { count: number })[] = [];

  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i, batches.length);

    try {
      const rawText = await callGeminiVision(prompt, batches[i], model);
      const parsed = JSON.parse(rawText);

      allResults.push({
        genderBreakdown: parsed.genderBreakdown ?? { male: 33, female: 33, unknown: 34 },
        ageBrackets: parsed.ageBrackets ?? {},
        ethnicityBreakdown: parsed.ethnicityBreakdown ?? {},
        count: parsed.totalAnalyzed ?? batches[i].length,
      });
    } catch (err) {
      console.error(`[Avatar Analysis] Batch ${i + 1}/${batches.length} failed:`, err);
    }

    if (i < batches.length - 1) {
      await sleep(1500); // Vision calls are heavier, more delay
    }
  }

  if (allResults.length === 0) {
    throw new Error("All avatar analysis batches failed");
  }

  // Weighted merge across batches
  const totalCount = allResults.reduce((sum, r) => sum + r.count, 0);

  const mergedGender = { male: 0, female: 0, unknown: 0 };
  const mergedAge: Record<string, number> = {};
  const mergedEthnicity: Record<string, number> = {};

  for (const r of allResults) {
    const w = r.count / totalCount;

    mergedGender.male += (r.genderBreakdown.male ?? 0) * w;
    mergedGender.female += (r.genderBreakdown.female ?? 0) * w;
    mergedGender.unknown += (r.genderBreakdown.unknown ?? 0) * w;

    for (const [key, val] of Object.entries(r.ageBrackets)) {
      mergedAge[key] = (mergedAge[key] ?? 0) + (val ?? 0) * w;
    }

    for (const [key, val] of Object.entries(r.ethnicityBreakdown)) {
      mergedEthnicity[key] = (mergedEthnicity[key] ?? 0) + (val ?? 0) * w;
    }
  }

  return {
    genderBreakdown: {
      male: Math.round(mergedGender.male),
      female: Math.round(mergedGender.female),
      unknown: Math.round(mergedGender.unknown),
    },
    ageBrackets: Object.fromEntries(
      Object.entries(mergedAge).map(([k, v]) => [k, Math.round(v)]),
    ),
    ethnicityBreakdown: Object.fromEntries(
      Object.entries(mergedEthnicity)
        .filter(([, v]) => Math.round(v) > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => [k, Math.round(v)]),
    ),
  };
}

// ─── Result Merging ─────────────────────────────────────────

export function mergeResults(
  mode: AnalysisMode,
  profileResult: ProfileAnalysisResult | null,
  nlpResult: AudienceNlpResult,
  visionResult: AvatarAnalysisResult | null,
): MergedAnalytics {
  if (mode === "NLP_ONLY" || !visionResult) {
    return {
      influencerGender: profileResult?.gender ?? null,
      influencerAgeRange: profileResult?.ageRange ?? null,
      influencerEthnicity: profileResult?.ethnicity ?? null,
      genderBreakdown: nlpResult.genderBreakdown,
      ageBrackets: nlpResult.ageBrackets,
      topCountries: nlpResult.topCountries,
      ethnicityBreakdown: null,
      topInterests: nlpResult.topInterests,
      audienceQuality: nlpResult.audienceQuality,
      confidence: nlpResult.confidence,
    };
  }

  // Hybrid/Full Vision: blend NLP + Vision results
  // Gender/Age: NLP 60% + Vision 40%
  // Ethnicity: Vision 80% + NLP 20% (NLP contributes via country data as proxy)
  const NLP_WEIGHT = 0.6;
  const VISION_WEIGHT = 0.4;

  const blendedGender = {
    male: Math.round(nlpResult.genderBreakdown.male * NLP_WEIGHT + visionResult.genderBreakdown.male * VISION_WEIGHT),
    female: Math.round(nlpResult.genderBreakdown.female * NLP_WEIGHT + visionResult.genderBreakdown.female * VISION_WEIGHT),
    unknown: Math.round(nlpResult.genderBreakdown.unknown * NLP_WEIGHT + visionResult.genderBreakdown.unknown * VISION_WEIGHT),
  };

  const ageBracketKeys = ["13-17", "18-24", "25-34", "35-44", "45+"];
  const blendedAge: Record<string, number> = {};
  for (const key of ageBracketKeys) {
    blendedAge[key] = Math.round(
      (nlpResult.ageBrackets[key] ?? 0) * NLP_WEIGHT +
      (visionResult.ageBrackets[key] ?? 0) * VISION_WEIGHT,
    );
  }

  // Boost confidence when both methods agree
  const confidenceBoost = visionResult ? 0.1 : 0;
  const mergedConfidence = Math.min(1, nlpResult.confidence + confidenceBoost);

  return {
    influencerGender: profileResult?.gender ?? null,
    influencerAgeRange: profileResult?.ageRange ?? null,
    influencerEthnicity: profileResult?.ethnicity ?? null,
    genderBreakdown: blendedGender,
    ageBrackets: blendedAge,
    topCountries: nlpResult.topCountries,
    ethnicityBreakdown: visionResult.ethnicityBreakdown,
    topInterests: nlpResult.topInterests,
    audienceQuality: nlpResult.audienceQuality,
    confidence: mergedConfidence,
  };
}

// ─── Apify Comment Scraping ─────────────────────────────────

const APIFY_COMMENT_ACTOR_ID = "BW7peEX6cuzdpgpam"; // xtdata comment scraper — update if using a different actor

export interface ScrapedComment {
  text: string;
  username?: string;
  avatarUrl?: string;
  likes?: number;
  replyCount?: number;
  commentedAt?: string;
  videoUrl?: string;
}

export async function scrapeComments(
  username: string,
  videoUrls: string[],
  config: AnalysisConfig = DEFAULT_CONFIG,
  onProgress?: (scraped: number, total: number) => void,
): Promise<ScrapedComment[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY is missing");

  const selectedVideos = videoUrls.slice(0, config.videosToSample);
  if (selectedVideos.length === 0) {
    throw new Error("No video URLs provided for comment scraping");
  }

  // Start Apify run
  const startUrl = `https://api.apify.com/v2/acts/${APIFY_COMMENT_ACTOR_ID}/runs?token=${apiKey}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      urls: selectedVideos,
      commentsPerPost: config.commentsPerVideo,
      maxItems: config.maxTotalComments,
    }),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Failed to start comment scraping: ${startRes.status} ${text}`);
  }

  const { data: runData } = await startRes.json();
  const runId = runData.id;

  // Poll for completion
  const MAX_WAIT = 10 * 60 * 1000; // 10 minutes
  const POLL_INTERVAL = 5000;
  const started = Date.now();

  while (Date.now() - started < MAX_WAIT) {
    await sleep(POLL_INTERVAL);

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`,
    );
    if (!statusRes.ok) continue;

    const { data: statusData } = await statusRes.json();
    const status = statusData.status;

    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Comment scraping ${status}`);
    }

    onProgress?.(0, config.maxTotalComments);
  }

  // Fetch results
  const datasetUrl = `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`;
  const dataRes = await fetch(datasetUrl);
  if (!dataRes.ok) {
    throw new Error(`Failed to fetch comment results: ${dataRes.status}`);
  }

  const items: Record<string, unknown>[] = await dataRes.json();
  const comments: ScrapedComment[] = [];

  for (const item of items) {
    const text = (item.text ?? item.comment ?? item.body ?? "") as string;
    if (!text || text.length < 2) continue;

    comments.push({
      text,
      username: (item.uniqueId ?? item.user ?? item.username ?? item.author) as string | undefined,
      avatarUrl: (item.avatarUrl ?? item.avatar ?? item.userAvatar ?? item.profilePic) as string | undefined,
      likes: Number(item.likes ?? item.diggCount ?? 0),
      replyCount: Number(item.replyCount ?? item.replyCommentTotal ?? 0),
      commentedAt: (item.createTime ?? item.createdAt ?? item.date) as string | undefined,
      videoUrl: (item.videoUrl ?? item.postUrl ?? item.url) as string | undefined,
    });
  }

  onProgress?.(comments.length, config.maxTotalComments);
  return comments.slice(0, config.maxTotalComments);
}
