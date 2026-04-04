import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { logApiUsage, estimateGeminiCost, estimateTokensFromText } from "@/app/lib/usage-tracking";
import { checkBudgetOrThrow, BudgetExceededError } from "@/app/lib/budget-guard";

type AiDraftResult = {
  subject: string;
  bodyText: string;
};

type InfluencerPromptContext = {
  username: string;
  email: string | null;
  bio: string | null;
  followers: number | null;
  socialLinks: string[];
  videoTitles: string[];
};

function buildPrompt(params: InfluencerPromptContext) {
  const { username, email, bio, followers, socialLinks, videoTitles } = params;

  return [
    "You are an expert outreach copywriter for influencer partnerships.",
    "Write a short, personalized cold outreach email.",
    "Return strict JSON only.",
    "",
    "GOALS:",
    "- Keep tone warm, concise, human.",
    "- Mention concrete details from profile context.",
    "- Include a clear CTA for a reply.",
    "- Keep body around 90-150 words.",
    "",
    "RULES:",
    "- Do NOT invent facts.",
    "- Do NOT mention missing data.",
    "- Do NOT use cringe sales language.",
    "- Do NOT include markdown.",
    "",
    "INFLUENCER CONTEXT:",
    `- Username: @${username}`,
    `- Email: ${email ?? "N/A"}`,
    `- Bio: ${bio ?? "N/A"}`,
    `- Followers: ${followers ?? "N/A"}`,
    `- Social links: ${socialLinks.length > 0 ? socialLinks.join(", ") : "N/A"}`,
    `- Recent video titles: ${videoTitles.length > 0 ? videoTitles.join(" | ") : "N/A"}`,
    "",
    "Return JSON with keys exactly:",
    '{"subject": string, "bodyText": string}',
  ].join("\n");
}

function normalizeDraft(raw: Partial<AiDraftResult>): AiDraftResult | null {
  const subject = (raw.subject ?? "").toString().trim();
  const bodyText = (raw.bodyText ?? "").toString().trim();
  if (!subject || !bodyText) return null;
  return { subject, bodyText };
}

function parseModelJson(rawText: string): Partial<AiDraftResult> | null {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed) as Partial<AiDraftResult>;
  } catch {
    // Sometimes model wraps JSON in markdown/code fences or surrounding text.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const objectSlice = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(objectSlice) as Partial<AiDraftResult>;
    } catch {
      return null;
    }
  }
}

function buildFallbackDraft(ctx: InfluencerPromptContext): AiDraftResult {
  const topicHint =
    ctx.videoTitles[0]?.trim() || ctx.bio?.trim() || "your content";
  const subject = `Collab idea for @${ctx.username}`;
  const bodyText = [
    `Hi @${ctx.username},`,
    "",
    `I came across your profile and really liked your focus on ${topicHint}.`,
    "I'm reaching out from Mixsoon because we'd love to explore a potential partnership that fits your style and audience.",
    "",
    "If you're open to it, I can share a simple proposal with content angle, timeline, and compensation details.",
    "",
    "Would you be open to a quick reply so we can discuss?",
    "",
    "Best,",
    "Mixsoon Team",
  ].join("\n");
  return { subject, bodyText };
}

async function generateDraftWithGemini(
  prompt: string,
  ctx: InfluencerPromptContext,
): Promise<AiDraftResult> {
  await checkBudgetOrThrow();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startTime = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logApiUsage({ service: "gemini_nlp", action: "email_ai_draft", status: "failed", durationMs: Date.now() - startTime, errorMessage: `${response.status} ${text}` }).catch(() => {});
      if (attempt === maxAttempts) {
        throw new Error(`Gemini request failed: ${response.status} ${text}`);
      }
      continue;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText || typeof rawText !== "string") {
      if (attempt === maxAttempts) {
        return buildFallbackDraft(ctx);
      }
      continue;
    }

    // Log cost
    const usageMeta = data?.usageMetadata;
    const inputTokens = usageMeta?.promptTokenCount ?? estimateTokensFromText(prompt);
    const outputTokens = usageMeta?.candidatesTokenCount ?? estimateTokensFromText(rawText);
    const costUsd = estimateGeminiCost(inputTokens, outputTokens);
    logApiUsage({ service: "gemini_nlp", action: "email_ai_draft", inputTokens, outputTokens, costUsd, durationMs: Date.now() - startTime, status: "success" }).catch(() => {});

    const parsed = parseModelJson(rawText);
    const normalized = parsed ? normalizeDraft(parsed) : null;
    if (normalized) {
      return normalized;
    }

    if (attempt === maxAttempts) {
      return buildFallbackDraft(ctx);
    }
  }
  return buildFallbackDraft(ctx);
}

export async function POST(req: Request) {
  try {
    await requirePermission("email", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const influencerId = String(body?.influencerId ?? "").trim();
    const to = Array.isArray(body?.to)
      ? body.to.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];

    if (!influencerId && to.length === 0) {
      return NextResponse.json(
        { error: "influencerId or recipient email is required" },
        { status: 400 },
      );
    }

    const influencer = influencerId
      ? await prisma.influencer.findUnique({
          where: { id: influencerId },
          select: {
            id: true,
            username: true,
            email: true,
            biolink: true,
            followers: true,
            socialLinks: true,
            videos: {
              take: 5,
              orderBy: { uploadedAt: "desc" },
              select: { title: true },
            },
          },
        })
      : await prisma.influencer.findFirst({
          where: {
            email: { equals: to[0] ?? "", mode: "insensitive" },
          },
          select: {
            id: true,
            username: true,
            email: true,
            biolink: true,
            followers: true,
            socialLinks: true,
            videos: {
              take: 5,
              orderBy: { uploadedAt: "desc" },
              select: { title: true },
            },
          },
        });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found for AI draft" },
        { status: 404 },
      );
    }

    let socialLinks: string[] = [];
    try {
      const parsed = influencer.socialLinks
        ? JSON.parse(influencer.socialLinks)
        : [];
      socialLinks = Array.isArray(parsed)
        ? parsed.filter((v) => typeof v === "string")
        : [];
    } catch {
      socialLinks = [];
    }

    const context: InfluencerPromptContext = {
      username: influencer.username,
      email: influencer.email,
      bio: influencer.biolink,
      followers: influencer.followers,
      socialLinks,
      videoTitles: influencer.videos
        .map((v) => v.title?.trim())
        .filter((v): v is string => Boolean(v)),
    };
    const prompt = buildPrompt(context);

    const draft = await generateDraftWithGemini(prompt, context);
    return NextResponse.json({
      influencerId: influencer.id,
      subject: draft.subject,
      bodyText: draft.bodyText,
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("[email-ai-draft] error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate AI draft",
      },
      { status: 500 },
    );
  }
}
