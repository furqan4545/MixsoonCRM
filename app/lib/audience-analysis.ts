// ─── Audience Analytics Engine ───────────────────────────────
// Gemini-powered NLP + Vision pipeline for demographic estimation

import type { AnalysisMode } from "@prisma/client";
import { logApiUsage, estimateGeminiCost, estimateTokensFromText } from "./usage-tracking";
import { checkBudgetOrThrow, BudgetExceededError } from "./budget-guard";
import { isGcsUrl, readGcsImage } from "./gcs-media";
import { runWithConcurrency } from "./concurrency";

// Gemini Flash allows ~2000 RPM on paid tier. 10 concurrent = well within limits
// and gives a ~10× speedup on batched NLP/Vision calls vs. sequential.
const GEMINI_CONCURRENCY = 10;

// ─── Types ──────────────────────────────────────────────────

export interface AnalysisConfig {
  videosToSample: number;
  commentsPerVideo: number;
  avatarsToAnalyze: number;
  commentBatchSize: number;
  geminiModel: string;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  videosToSample: 20,
  commentsPerVideo: 50,
  avatarsToAnalyze: 100,
  commentBatchSize: 200,
  geminiModel: "gemini-2.5-flash",
};

export interface ProfileAnalysisResult {
  gender: string;   // "male" | "female" | "unknown"
  ageRange: string;  // e.g. "25-34"
  ethnicity: string; // e.g. "East Asian"
  country: string;   // e.g. "US|United States"
}

export interface CommentSentiment {
  positive: number;   // % of comments that are positive/supportive
  negative: number;   // % that are critical/negative
  neutral: number;    // % that are neutral/informational
  humorous: number;   // % that are jokes/memes/laughing
}

export interface CommentTopic {
  topic: string;       // e.g. "Product inquiries", "Price questions", "Humor/Jokes"
  percentage: number;  // % of comments about this topic
  sentiment: string;   // "positive" | "negative" | "neutral" | "mixed"
  sampleComments: string[]; // 2-3 example comments for this topic
}

export interface AudienceNlpResult {
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  topCountries: { country: string; countryName: string; percentage: number }[];
  topInterests: { category: string; score: number }[];
  audienceQuality: number;
  confidence: number;
  reasoning: string;
  // Comment content analysis
  sentiment: CommentSentiment;
  commentTopics: CommentTopic[];
  commentSummary: string; // 2-3 sentence summary of what the audience is talking about
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
  influencerCountry: string | null;
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  topCountries: { country: string; countryName: string; percentage: number }[];
  ethnicityBreakdown: Record<string, number> | null;
  topInterests: { category: string; score: number }[];
  audienceQuality: number;
  confidence: number;
  // Comment content analysis
  sentiment: CommentSentiment | null;
  commentTopics: CommentTopic[] | null;
  commentSummary: string | null;
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
  action: string = "audience_nlp",
): Promise<string> {
  await checkBudgetOrThrow();

  const startTime = Date.now();
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
    logApiUsage({ service: "gemini_nlp", action, status: "failed", durationMs: Date.now() - startTime, errorMessage: `${response.status} ${text}` }).catch(() => {});
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini returned empty response");
  }

  // Log cost using actual token counts from API response, or estimate
  const usageMeta = data?.usageMetadata;
  const inputTokens = usageMeta?.promptTokenCount ?? estimateTokensFromText(prompt);
  const outputTokens = usageMeta?.candidatesTokenCount ?? estimateTokensFromText(rawText);
  const costUsd = estimateGeminiCost(inputTokens, outputTokens);
  logApiUsage({ service: "gemini_nlp", action, inputTokens, outputTokens, costUsd, durationMs: Date.now() - startTime, status: "success" }).catch(() => {});

  return rawText;
}

async function callGeminiVision(
  prompt: string,
  imageUrls: string[],
  model: string,
  action: string = "audience_vision",
): Promise<string> {
  await checkBudgetOrThrow();

  const startTime = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Download images and convert to base64.
  // Supports both HTTP(S) URLs and gcs:// URIs — avatars are cached to GCS at
  // scrape time to avoid TikTok's expiring signed URLs, so most imageUrls here
  // will be gcs:// which Node's fetch() can't handle directly.
  const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
  const skipReasons: string[] = [];

  for (const url of imageUrls) {
    try {
      let buffer: ArrayBuffer | null = null;
      let contentType = "image/jpeg";

      if (isGcsUrl(url)) {
        const img = await readGcsImage(url);
        if (!img) {
          skipReasons.push(`gcs-not-found:${url.slice(0, 80)}`);
          continue;
        }
        buffer = img.body;
        contentType = img.contentType;
      } else {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          skipReasons.push(`http-${res.status}:${url.slice(0, 80)}`);
          continue;
        }
        buffer = await res.arrayBuffer();
        contentType = res.headers.get("content-type") || "image/jpeg";
      }

      // Gemini Vision supports: image/png, image/jpeg, image/webp, image/heic, image/heif
      // Normalize weird/missing content-types by sniffing magic bytes.
      const u8 = new Uint8Array(buffer);
      if (u8[0] === 0xff && u8[1] === 0xd8) contentType = "image/jpeg";
      else if (u8[0] === 0x89 && u8[1] === 0x50) contentType = "image/png";
      else if (
        u8.length >= 12 &&
        String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) === "RIFF" &&
        String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === "WEBP"
      ) contentType = "image/webp";
      else if (
        u8.length >= 12 &&
        String.fromCharCode(u8[4], u8[5], u8[6], u8[7]) === "ftyp"
      ) contentType = "image/heic";

      const base64 = Buffer.from(buffer).toString("base64");
      imageParts.push({
        inlineData: { mimeType: contentType, data: base64 },
      });
    } catch (e) {
      skipReasons.push(`err:${(e as Error).message?.slice(0, 80)}`);
      continue;
    }
  }

  if (imageParts.length === 0) {
    console.error(
      `[Gemini Vision] No images could be downloaded from ${imageUrls.length} URL(s). Reasons:`,
      skipReasons,
    );
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
    logApiUsage({ service: "gemini_vision", action, status: "failed", durationMs: Date.now() - startTime, errorMessage: `${response.status} ${text}` }).catch(() => {});
    throw new Error(`Gemini Vision request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini Vision returned empty response");
  }

  // Log cost: use API token counts if available, otherwise estimate (258 tokens per image)
  const usageMeta = data?.usageMetadata;
  const imageTokenEstimate = imageParts.length * 258; // ~258 tokens per image
  const inputTokens = usageMeta?.promptTokenCount ?? (estimateTokensFromText(prompt) + imageTokenEstimate);
  const outputTokens = usageMeta?.candidatesTokenCount ?? estimateTokensFromText(rawText);
  const costUsd = estimateGeminiCost(inputTokens, outputTokens);
  logApiUsage({ service: "gemini_vision", action, inputTokens, outputTokens, costUsd, durationMs: Date.now() - startTime, inputCount: imageParts.length, status: "success" }).catch(() => {});

  return rawText;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Influencer Profile Analysis (Gemini Vision) ──────────

export async function analyzeInfluencerProfile(
  avatarUrl: string,
  bio: string | null = null,
  model: string = DEFAULT_CONFIG.geminiModel,
): Promise<ProfileAnalysisResult> {
  const bioContext = bio
    ? `\n\nThe influencer's bio text is: "${bio}"\nUse the bio language, email domains, location mentions, country flags, and cultural references to help estimate country.`
    : "";

  const prompt = [
    "Analyze this profile picture of a social media influencer.",
    "Estimate the following based on visual appearance:",
    "",
    "1. gender: 'male', 'female', or 'unknown'",
    "2. ageRange: one of '13-17', '18-24', '25-34', '35-44', '45+'",
    "3. ethnicity: one of 'East Asian', 'South Asian', 'Southeast Asian', 'White/Caucasian', 'Black', 'Latino', 'Middle Eastern', 'Central Asian', 'Mixed', 'Unknown'",
    "4. country: estimate the influencer's most likely country of origin or residence.",
    "   - Use ALL available signals: visual appearance, clothing, background, ethnicity, bio text, bio language, email domain (.co.uk = UK, .co = Colombia, etc.)",
    "   - If the person appears South Asian and content is in English, likely US, UK, Canada, or India",
    "   - If the person appears East Asian, likely South Korea, Japan, China, or US",
    "   - If the person appears Latino, likely US, Mexico, Brazil, or Colombia",
    "   - Make your best estimate based on available signals. If you genuinely cannot determine the country, return 'Unknown'.",
    "   - Return as 'CODE|Name' format: 'US|United States', 'KR|South Korea', 'GB|United Kingdom', 'IN|India', 'BR|Brazil', 'CA|Canada', 'AU|Australia', 'PK|Pakistan', etc.",
    "",
    "If the image does not clearly show a face (logo, cartoon, group photo, object), return gender='unknown', ageRange='unknown', ethnicity='Unknown'. Still estimate country from bio if available.",
    bioContext,
    "",
    'Return JSON only: {"gender": string, "ageRange": string, "ethnicity": string, "country": string}',
  ].join("\n");

  let gender = "unknown";
  let ageRange = "unknown";
  let ethnicity = "Unknown";
  let country = "Unknown";

  try {
    const rawText = await callGeminiVision(prompt, [avatarUrl], model);
    const parsed = JSON.parse(rawText);
    gender = parsed.gender ?? "unknown";
    ageRange = parsed.ageRange ?? "unknown";
    ethnicity = parsed.ethnicity ?? "Unknown";
    country = parsed.country ?? "Unknown";
  } catch (err) {
    console.error("[Profile Analysis] Vision call failed, falling back to text-only:", (err as Error).message);
  }

  // If vision couldn't determine country, try a text-only call with all available signals
  if (country === "Unknown" || !country) {
    try {
      const countryPrompt = [
        "Based on the following information about a TikTok influencer, estimate their most likely country of residence.",
        "",
        `Detected ethnicity: ${ethnicity}`,
        `Detected gender: ${gender}`,
        `Detected age range: ${ageRange}`,
        `Bio text: ${bio ?? "no bio available"}`,
        "",
        "Use ALL available signals: ethnicity, bio language, email domains, cultural references, charity/organization names, etc.",
        "If you can make a reasonable estimate, return it. If you genuinely cannot determine the country, return 'Unknown'.",
        "",
        'Return JSON only: {"country": "CODE|Name"}',
        'Examples: {"country": "US|United States"}, {"country": "GB|United Kingdom"}, {"country": "Unknown"}',
      ].join("\n");

      const countryText = await callGeminiText(countryPrompt, model);
      console.log("[Profile Analysis] Country text fallback raw:", countryText);
      let countryParsed = JSON.parse(countryText);
      if (Array.isArray(countryParsed)) countryParsed = countryParsed[0];
      if (countryParsed?.country) {
        country = countryParsed.country;
        console.log("[Profile Analysis] Country from text fallback:", country);
      }
    } catch (err) {
      console.error("[Profile Analysis] Country text fallback failed:", (err as Error).message);
    }
  }

  return { gender, ageRange, ethnicity, country };
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
    "6. COMMENT SENTIMENT:",
    "   - Classify each comment's tone: positive (supportive, compliments, love), negative (criticism, complaints, hate), neutral (questions, observations), humorous (jokes, memes, laughing, 💀😂)",
    "   - Return overall percentage breakdown",
    "",
    "7. COMMENT TOPICS (for marketing analysis):",
    "   - What are commenters talking about? Categorize into topics like:",
    '     * "Product inquiries" — asking about products, where to buy, links',
    '     * "Price/cost questions" — asking how much, is it worth it, affordability',
    '     * "Personal stories" — sharing own experiences, relating to content',
    '     * "Humor/jokes" — memes, jokes, funny reactions, sarcasm',
    '     * "Compliments/fan love" — praising the creator, expressing admiration',
    '     * "Criticism/hate" — negative feedback, trolling, disagreement',
    '     * "Requests/suggestions" — asking for specific content, collabs, features',
    '     * "Tagging friends" — @mentions, "show this to X"',
    '     * "Debate/discussion" — arguing about topics in the video',
    '     * "Spam/self-promo" — promoting own content, follow-for-follow',
    "   - Include 2-3 actual example comments per topic (shortened if needed)",
    "   - Assign sentiment per topic (positive, negative, neutral, mixed)",
    "",
    "8. COMMENT SUMMARY:",
    "   - Write a 2-3 sentence marketing-focused summary of what the audience is talking about",
    "   - Highlight the dominant conversation themes and overall tone",
    "",
    "=== RULES ===",
    "- Base estimates ONLY on evidence in the comments",
    "- Percentages must sum to 100 for gender and age brackets",
    "- Country percentages should sum to 100",
    "- Sentiment percentages must sum to 100",
    "- Topic percentages should sum to approximately 100",
    "- Express uncertainty: if comments are mostly in one language, acknowledge the sample bias",
    "",
    "Return JSON:",
    "{",
    '  "genderBreakdown": { "male": number, "female": number, "unknown": number },',
    '  "ageBrackets": { "13-17": number, "18-24": number, "25-34": number, "35-44": number, "45+": number },',
    '  "topCountries": [{ "country": "XX", "countryName": "...", "percentage": number }],',
    '  "topInterests": [{ "category": "...", "score": number }],',
    '  "audienceQuality": number,',
    '  "confidence": number,',
    '  "reasoning": "Brief explanation of key signals found",',
    '  "sentiment": { "positive": number, "negative": number, "neutral": number, "humorous": number },',
    '  "commentTopics": [{ "topic": "...", "percentage": number, "sentiment": "positive|negative|neutral|mixed", "sampleComments": ["...", "..."] }],',
    '  "commentSummary": "2-3 sentence marketing summary of audience conversation"',
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
  let completedBatches = 0;

  // Parallelize with bounded concurrency — was sequential with 1s sleep between
  // calls, which on a 2500-comment dataset with batchSize=10 took 20+ minutes.
  await runWithConcurrency(batches, GEMINI_CONCURRENCY, async (batch, i) => {
    try {
      const prompt = buildNlpPrompt(username, batch);
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
        sentiment: parsed.sentiment ?? { positive: 25, negative: 25, neutral: 25, humorous: 25 },
        commentTopics: parsed.commentTopics ?? [],
        commentSummary: parsed.commentSummary ?? "",
        count: batch.length,
      });
    } catch (err) {
      console.error(`[Audience NLP] Batch ${i + 1}/${batches.length} failed:`, err);
      // Continue with other batches — partial results are OK
    } finally {
      completedBatches += 1;
      onProgress?.(completedBatches, batches.length);
    }
  });

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

  // Weighted average for sentiment
  const sentiment = { positive: 0, negative: 0, neutral: 0, humorous: 0 };
  for (const b of batches) {
    const w = b.count / totalCount;
    sentiment.positive += (b.sentiment?.positive ?? 0) * w;
    sentiment.negative += (b.sentiment?.negative ?? 0) * w;
    sentiment.neutral += (b.sentiment?.neutral ?? 0) * w;
    sentiment.humorous += (b.sentiment?.humorous ?? 0) * w;
  }

  // Merge comment topics — aggregate by topic name, keep best sample comments
  const topicMap = new Map<string, { percentage: number; sentiment: string; sampleComments: string[] }>();
  for (const b of batches) {
    const w = b.count / totalCount;
    for (const t of (b.commentTopics ?? [])) {
      const existing = topicMap.get(t.topic);
      if (existing) {
        existing.percentage += (t.percentage ?? 0) * w;
        // Keep more sample comments
        if (t.sampleComments?.length) {
          existing.sampleComments.push(...t.sampleComments);
        }
      } else {
        topicMap.set(t.topic, {
          percentage: (t.percentage ?? 0) * w,
          sentiment: t.sentiment ?? "neutral",
          sampleComments: [...(t.sampleComments ?? [])],
        });
      }
    }
  }
  const commentTopics = [...topicMap.entries()]
    .map(([topic, data]) => ({
      topic,
      percentage: Math.round(data.percentage),
      sentiment: data.sentiment,
      sampleComments: data.sampleComments.slice(0, 3), // Keep max 3 examples
    }))
    .filter((t) => t.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);

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
    sentiment: {
      positive: Math.round(sentiment.positive),
      negative: Math.round(sentiment.negative),
      neutral: Math.round(sentiment.neutral),
      humorous: Math.round(sentiment.humorous),
    },
    commentTopics,
    commentSummary: batches.map((b) => b.commentSummary).filter(Boolean)[0] ?? "",
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
  let completedVisionBatches = 0;

  // Parallelize Vision batches — was sequential with 1.5s sleep between calls.
  // Vision is slower per call but 10 concurrent is still well under Gemini's
  // rate limit, and gives ~10× speedup on large avatar sets.
  await runWithConcurrency(batches, GEMINI_CONCURRENCY, async (batch, i) => {
    try {
      const rawText = await callGeminiVision(prompt, batch, model);
      const parsed = JSON.parse(rawText);

      allResults.push({
        genderBreakdown: parsed.genderBreakdown ?? { male: 33, female: 33, unknown: 34 },
        ageBrackets: parsed.ageBrackets ?? {},
        ethnicityBreakdown: parsed.ethnicityBreakdown ?? {},
        count: parsed.totalAnalyzed ?? batch.length,
      });
    } catch (err) {
      console.error(`[Avatar Analysis] Batch ${i + 1}/${batches.length} failed:`, err);
    } finally {
      completedVisionBatches += 1;
      onProgress?.(completedVisionBatches, batches.length);
    }
  });

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
      influencerCountry: profileResult?.country ?? null,
      genderBreakdown: nlpResult.genderBreakdown,
      ageBrackets: nlpResult.ageBrackets,
      topCountries: nlpResult.topCountries,
      ethnicityBreakdown: null,
      topInterests: nlpResult.topInterests,
      audienceQuality: nlpResult.audienceQuality,
      confidence: nlpResult.confidence,
      sentiment: nlpResult.sentiment ?? null,
      commentTopics: nlpResult.commentTopics ?? null,
      commentSummary: nlpResult.commentSummary ?? null,
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
    sentiment: nlpResult.sentiment ?? null,
    commentTopics: nlpResult.commentTopics ?? null,
    commentSummary: nlpResult.commentSummary ?? null,
  };
}

// ─── Apify Comment Scraping ─────────────────────────────────

// clockworks/tiktok-comments-scraper — dedicated TikTok comment scraping actor
const APIFY_COMMENT_ACTOR_ID = "clockworks~tiktok-comments-scraper";

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

  // Filter to actual video URLs (must contain /video/). The clockworks comment
  // scraper does NOT accept profile URLs — sending one causes the actor run to
  // FAIL. If we have no video URLs, skip cleanly and return empty.
  const actualVideoUrls = videoUrls.filter((u) => u.includes("/video/"));
  const selectedVideos = actualVideoUrls.slice(0, config.videosToSample);

  if (selectedVideos.length === 0) {
    console.warn(
      `[Comment Scraper] No video URLs for @${username} (out of ${videoUrls.length} stored URLs). Skipping comment scrape — analytics will run without comments.`,
    );
    return [];
  }

  const postURLs = selectedVideos;

  console.log(
    `[Comment Scraper] Scraping comments for @${username}: ${postURLs.length} URLs, ${config.commentsPerVideo} per post`,
  );

  // Start Apify run with clockworks comment scraper input format
  const startUrl = `https://api.apify.com/v2/acts/${APIFY_COMMENT_ACTOR_ID}/runs?token=${apiKey}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postURLs: postURLs,
      commentsPerPost: config.commentsPerVideo,
      maxRepliesPerComment: 0,
      resultsPerPage: 100,
    }),
  });

  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`Failed to start comment scraping: ${startRes.status} ${text}`);
  }

  const { data: runData } = await startRes.json();
  const runId = runData.id;
  console.log(`[Comment Scraper] Apify run started: ${runId}`);

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

    if (status === "SUCCEEDED") {
      console.log(`[Comment Scraper] Run completed successfully`);
      break;
    }
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      const reason =
        (statusData.statusMessage as string | undefined) ??
        (statusData.meta?.origin as string | undefined) ??
        "(no reason from Apify)";
      throw new Error(`Comment scraping ${status}: ${reason}`);
    }

    // Total comments is bounded by videosToSample × commentsPerVideo
    onProgress?.(0, config.videosToSample * config.commentsPerVideo);
  }

  // Fetch results — cap at videosToSample × commentsPerVideo (theoretical max)
  const totalCap = config.videosToSample * config.commentsPerVideo;
  const datasetUrl = `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${totalCap}`;
  const dataRes = await fetch(datasetUrl);
  if (!dataRes.ok) {
    throw new Error(`Failed to fetch comment results: ${dataRes.status}`);
  }

  const items: Record<string, unknown>[] = await dataRes.json();
  console.log(`[Comment Scraper] Got ${items.length} raw items from Apify`);

  // Log first item keys for debugging field mapping
  if (items.length > 0) {
    console.log(`[Comment Scraper] Sample item keys:`, Object.keys(items[0]));
  }

  const comments: ScrapedComment[] = [];

  for (const item of items) {
    // clockworks comment scraper field names: text, uniqueId, avatarThumbnail, diggCount, replyCount, createTimeISO
    const text = (item.text ?? item.comment ?? item.body ?? "") as string;
    if (!text || text.length < 2) continue;

    comments.push({
      text,
      username: (item.uniqueId ?? item.user ?? item.username ?? item.author) as string | undefined,
      avatarUrl: (item.avatarThumbnail ?? item.avatarUrl ?? item.avatar ?? item.userAvatar ?? item.profilePic) as string | undefined,
      likes: Number(item.diggCount ?? item.likes ?? 0),
      replyCount: Number(item.replyCount ?? item.replyCommentTotal ?? 0),
      commentedAt: (item.createTimeISO ?? item.createTime ?? item.createdAt ?? item.date) as string | undefined,
      videoUrl: (item.videoWebUrl ?? item.videoUrl ?? item.postUrl ?? item.url) as string | undefined,
    });
  }

  console.log(`[Comment Scraper] Parsed ${comments.length} valid comments`);
  onProgress?.(comments.length, totalCap);
  return comments.slice(0, totalCap);
}
