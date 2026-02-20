interface CampaignContext {
  campaignName: string;
  notes?: string | null;
  targetKeywords: string[];
  avoidKeywords: string[];
  strictness: number;
}

interface InfluencerContext {
  username: string;
  bio: string | null;
  followers: number | null;
  email: string | null;
  phone: string | null;
  socialLinks: string | null;
  videos: { title: string | null; views: number | null }[];
}

export type PreFilterResult = {
  label: "NONE" | "LIKELY_RELEVANT" | "REVIEW_QUEUE";
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

export function runPreFilter(
  influencer: InfluencerContext,
  campaign: CampaignContext,
): PreFilterResult {
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

  return {
    label: "LIKELY_RELEVANT",
    matchedTarget: target,
    matchedAvoid: avoid,
    shouldRunAi: true,
    reason:
      target.length > 0
        ? "Contains campaign target keywords."
        : "No hard-negative conflict. Eligible for AI scoring.",
  };
}

export function mapScoreToBucket(
  score: number,
): "APPROVED" | "OKISH" | "REJECTED" {
  if (score >= 70) return "APPROVED";
  if (score >= 45) return "OKISH";
  return "REJECTED";
}

export async function scoreWithGemini(
  influencer: InfluencerContext,
  campaign: CampaignContext,
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
            `${i + 1}. ${v.title ?? "Untitled"} (views: ${v.views ?? "N/A"})`,
        )
      : ["  (no videos)"]),
    "",
    "=== SCORING RULES (follow strictly) ===",
    "Score 0-100 where higher = better fit for the campaign.",
    "",
    "AUTOMATIC LOW SCORES (must follow):",
    "- If the influencer has NO bio, NO videos, and NO meaningful profile data: score 0-10. These are likely spam/inactive accounts.",
    "- If username is 'unknown' or clearly a placeholder: score 0-5.",
    "- If the influencer has no content related to campaign keywords at all: score 15-30 max.",
    "- If content actively matches avoid keywords: score 0-15.",
    "",
    "POSITIVE SCORING:",
    "- Direct keyword match in bio or video titles: 70-95 depending on strength.",
    "- Tangential/adjacent content: 40-60 range.",
    "- Strong follower count with relevant content: bonus up to +10.",
    "",
    "Strictness adjusts the bar: higher strictness means only strong direct matches get high scores.",
    !hasAnyContent
      ? "\nWARNING: This influencer has essentially NO profile data. This is almost certainly a spam or inactive account. Score accordingly (0-10)."
      : "",
    "",
    "Return JSON with keys:",
    `{"score": number, "reasons": string, "matchedSignals": string, "riskSignals": string}`,
  ].join("\n");

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
