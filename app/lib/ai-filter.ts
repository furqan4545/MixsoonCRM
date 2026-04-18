import { logApiUsage, estimateGeminiCost, estimateTokensFromText } from "./usage-tracking";
import { checkBudgetOrThrow } from "./budget-guard";

interface CampaignContext {
  campaignName: string;
  notes?: string | null;
  targetKeywords: string[];
  avoidKeywords: string[];
  strictness: number;
  // Deterministic pre-filters. Null/undefined = disabled.
  maxDaysSinceLastPost?: number | null;
  minFollowers?: number | null;
  minVideoCount?: number | null;
}

interface InfluencerContext {
  username: string;
  bio: string | null;
  followers: number | null;
  email: string | null;
  phone: string | null;
  socialLinks: string | null;
  videos: { title: string | null; views: number | null; uploadedAt: Date | null }[];
  totalVideoCount?: number; // true count; falls back to videos.length when omitted
}

export type PreFilterResult = {
  label:
    | "NONE"
    | "LIKELY_RELEVANT"
    | "NO_KEYWORD_MATCH"
    | "REVIEW_QUEUE"
    | "DETERMINISTIC_REJECTED";
  matchedTarget: string[];
  matchedAvoid: string[];
  shouldRunAi: boolean;
  reason: string;
};

export type AiScoreResult = {
  score: number;
  reasons: string;
  matchedSignals: string;
  riskSignals: string;
};

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function compileCorpus(input: InfluencerContext): string {
  return [
    input.username,
    input.bio ?? "",
    ...input.videos.map((v) => v.title ?? ""),
  ]
    .join(" ")
    .toLowerCase();
}

function rejectDeterministic(reason: string): PreFilterResult {
  return {
    label: "DETERMINISTIC_REJECTED",
    matchedTarget: [],
    matchedAvoid: [],
    shouldRunAi: false,
    reason,
  };
}

export function runPreFilter(
  influencer: InfluencerContext,
  campaign: CampaignContext,
): PreFilterResult {
  // Deterministic rules run first — cheap rejection, no LLM call.
  if (
    campaign.minFollowers != null &&
    (influencer.followers ?? 0) < campaign.minFollowers
  ) {
    return rejectDeterministic(
      `Below follower threshold (${influencer.followers ?? 0} < ${campaign.minFollowers}).`,
    );
  }

  const videoCount = influencer.totalVideoCount ?? influencer.videos.length;
  if (campaign.minVideoCount != null && videoCount < campaign.minVideoCount) {
    return rejectDeterministic(
      `Below video-count threshold (${videoCount} < ${campaign.minVideoCount}).`,
    );
  }

  if (campaign.maxDaysSinceLastPost != null) {
    const latest = influencer.videos.reduce<Date | null>((max, v) => {
      if (!v.uploadedAt) return max;
      return !max || v.uploadedAt > max ? v.uploadedAt : max;
    }, null);

    if (!latest) {
      return rejectDeterministic(
        `No dated posts on profile (recency filter requires last post within ${campaign.maxDaysSinceLastPost} days).`,
      );
    }

    const daysSince = Math.floor(
      (Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSince > campaign.maxDaysSinceLastPost) {
      return rejectDeterministic(
        `Last post was ${daysSince} days ago (max ${campaign.maxDaysSinceLastPost}).`,
      );
    }
  }

  const hasFilters =
    campaign.targetKeywords.length > 0 || campaign.avoidKeywords.length > 0;
  if (!hasFilters) {
    return {
      label: "NONE",
      matchedTarget: [],
      matchedAvoid: [],
      shouldRunAi: true,
      reason: "No pre-filter configured. Sent directly to AI scoring.",
    };
  }

  const corpus = compileCorpus(influencer);
  const target = campaign.targetKeywords
    .map(normalizeKeyword)
    .filter(Boolean)
    .filter((k) => corpus.includes(k));
  const avoid = campaign.avoidKeywords
    .map(normalizeKeyword)
    .filter(Boolean)
    .filter((k) => corpus.includes(k));

  if (avoid.length > 0 && target.length === 0) {
    return {
      label: "REVIEW_QUEUE",
      matchedTarget: target,
      matchedAvoid: avoid,
      shouldRunAi: false,
      reason:
        "Matches avoided keywords with no positive target signal. Requires manual review.",
    };
  }

  const hasTargetKeywords = campaign.targetKeywords.length > 0;

  if (hasTargetKeywords && target.length === 0) {
    return {
      label: "NO_KEYWORD_MATCH",
      matchedTarget: [],
      matchedAvoid: avoid,
      shouldRunAi: true,
      reason:
        "Target keywords configured but NONE found in bio or video titles. AI should score conservatively (max 35 unless very strong indirect evidence).",
    };
  }

  return {
    label: "LIKELY_RELEVANT",
    matchedTarget: target,
    matchedAvoid: avoid,
    shouldRunAi: true,
    reason:
      target.length > 0
        ? "Contains campaign target keywords."
        : "No keyword filters configured. Eligible for AI scoring.",
  };
}

export function mapScoreToBucket(
  score: number,
): "APPROVED" | "OKISH" | "REJECTED" {
  if (score >= 75) return "APPROVED";
  if (score >= 45) return "OKISH";
  return "REJECTED";
}

export async function scoreWithGemini(
  influencer: InfluencerContext,
  campaign: CampaignContext,
  preFilter?: PreFilterResult,
): Promise<AiScoreResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const videoList = influencer.videos.slice(0, 15);
  const hasAnyContent = !!(
    influencer.bio ||
    influencer.followers ||
    videoList.some((v) => v.title)
  );
  const hasVideoTitles = videoList.some((v) => v.title);
  const noKeywordMatch = preFilter?.label === "NO_KEYWORD_MATCH";

  const prompt = [
    "You are a strict influencer relevance evaluator for marketing campaigns.",
    "Return strict JSON only.",
    "",
    "=== CAMPAIGN ===",
    `Name: ${campaign.campaignName}`,
    `Notes: ${campaign.notes ?? "N/A"}`,
    `Target keywords: ${campaign.targetKeywords.join(", ") || "none"}`,
    `Avoid keywords: ${campaign.avoidKeywords.join(", ") || "none"}`,
    `Strictness (0-100): ${campaign.strictness}`,
    "",
    "=== PRE-FILTER RESULT ===",
    `Label: ${preFilter?.label ?? "NONE"}`,
    `Target keywords found in profile: ${preFilter?.matchedTarget?.length ? preFilter.matchedTarget.join(", ") : "NONE"}`,
    `Avoid keywords found in profile: ${preFilter?.matchedAvoid?.length ? preFilter.matchedAvoid.join(", ") : "NONE"}`,
    "",
    "=== INFLUENCER ===",
    `Username: @${influencer.username}`,
    `Bio: ${influencer.bio ?? "N/A"}`,
    `Followers: ${influencer.followers ?? "N/A"}`,
    `Email: ${influencer.email ?? "N/A"}`,
    `Social links: ${influencer.socialLinks ?? "N/A"}`,
    "Recent videos:",
    ...(videoList.length > 0
      ? videoList.map(
          (v, i) =>
            `${i + 1}. ${v.title ?? "(no title)"} (views: ${v.views ?? "N/A"})`,
        )
      : ["  (no videos)"]),
    "",
    "=== SCORING RULES (follow strictly — violations will be flagged) ===",
    "Score 0-100 where higher = better fit for the campaign.",
    "",
    "CRITICAL RULE — EVIDENCE ONLY:",
    "- You MUST score based ONLY on concrete evidence visible in the data above.",
    "- NEVER assume, infer, or guess what content an influencer might create.",
    "- NEVER assume relevance based on follower count, engagement, or having an email/social links alone.",
    "- If there is no direct textual evidence linking the influencer to campaign keywords, that is a NEGATIVE signal, not a neutral one.",
    "",
    "AUTOMATIC LOW SCORES (mandatory — override everything else):",
    "- NO bio, NO videos, NO meaningful data → score 0-10 (spam/inactive).",
    "- Username is 'unknown' or placeholder → score 0-5.",
    "- Content actively matches avoid keywords → score 0-15.",
    `- Pre-filter found ZERO target keyword matches → score 0-35 max. ${noKeywordMatch ? "THIS APPLIES TO THIS INFLUENCER." : ""}`,
    "- Video titles are missing/null (scraped but unavailable) → treat as NO content evidence. Do NOT assume what the videos contain.",
    "",
    "POSITIVE SCORING (only when evidence exists):",
    "- Direct keyword match in bio or video titles: 70-95 depending on strength and quantity.",
    "- Tangential/adjacent but clearly related content (e.g. 'makeup tutorial' for a beauty campaign): 40-65.",
    "- Follower count only provides a bonus of up to +5, and ONLY when content relevance is already established (score >= 40 from content alone).",
    "",
    "Strictness adjusts the bar: higher strictness means only strong direct matches get high scores.",
    !hasAnyContent
      ? "\nWARNING: This influencer has essentially NO profile data. This is almost certainly a spam or inactive account. Score 0-10."
      : "",
    !hasVideoTitles && videoList.length > 0
      ? "\nWARNING: Video titles are ALL missing/null. You have NO information about video content. Do NOT assume or guess what the videos are about. Score based only on bio and username."
      : "",
    noKeywordMatch
      ? "\nWARNING: The pre-filter scanned the bio and all video titles and found ZERO matches for any target keyword. Unless the bio contains very strong indirect evidence, score should be 0-35."
      : "",
    "",
    "Return JSON with keys:",
    `{"score": number, "reasons": string, "matchedSignals": string, "riskSignals": string}`,
  ].join("\n");

  await checkBudgetOrThrow();
  const startTime = Date.now();

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
    logApiUsage({ service: "gemini_nlp", action: "ai_filter_score", status: "failed", durationMs: Date.now() - startTime, errorMessage: `${response.status} ${text}` }).catch(() => {});
    throw new Error(`Gemini request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Gemini returned empty response");
  }

  // Log cost
  const usageMeta = data?.usageMetadata;
  const inputTokens = usageMeta?.promptTokenCount ?? estimateTokensFromText(prompt);
  const outputTokens = usageMeta?.candidatesTokenCount ?? estimateTokensFromText(rawText);
  const costUsd = estimateGeminiCost(inputTokens, outputTokens);
  logApiUsage({ service: "gemini_nlp", action: "ai_filter_score", inputTokens, outputTokens, costUsd, durationMs: Date.now() - startTime, status: "success" }).catch(() => {});

  let parsed: Partial<AiScoreResult> & { score?: number };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${rawText}`);
  }

  const score = Number(parsed.score);
  if (!Number.isFinite(score)) {
    throw new Error(`Gemini score is invalid: ${rawText}`);
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: parsed.reasons?.toString() ?? "",
    matchedSignals: parsed.matchedSignals?.toString() ?? "",
    riskSignals: parsed.riskSignals?.toString() ?? "",
  };
}
