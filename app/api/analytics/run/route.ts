import { after, type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  analyzeInfluencerProfile,
  analyzeAudienceComments,
  analyzeCommenterAvatars,
  scrapeComments,
  mergeResults,
  DEFAULT_CONFIG,
  type AnalysisConfig,
  type ScrapedComment,
  type AudienceNlpResult,
} from "../../../lib/audience-analysis";
import type { AnalysisMode } from "@prisma/client";
import { checkBudgetOrThrow, BudgetExceededError } from "@/app/lib/budget-guard";

export const maxDuration = 300;

const MIN_VIDEOS = 1; // Allow analysis with even 1 video
const MIN_COMMENTS = 0; // Analyze whatever is available — even 0 comments (will use profile pic only)

export async function loadConfig(): Promise<AnalysisConfig & { defaultMode: AnalysisMode }> {
  const cfg = await prisma.analysisConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    return { ...DEFAULT_CONFIG, defaultMode: "HYBRID" };
  }
  return {
    videosToSample: cfg.videosToSample,
    commentsPerVideo: cfg.commentsPerVideo,
    avatarsToAnalyze: cfg.avatarsToAnalyze,
    commentBatchSize: cfg.commentBatchSize,
    geminiModel: cfg.geminiModel,
    defaultMode: cfg.defaultMode,
  };
}

async function updateRunStatus(
  runId: string,
  update: {
    status?: string;
    progress?: number;
    progressMsg?: string;
    commentCount?: number;
    avatarCount?: number;
    analyzedCount?: number;
    errorMessage?: string;
  },
) {
  await prisma.analysisRun.update({
    where: { id: runId },
    data: update as Parameters<typeof prisma.analysisRun.update>[0]["data"],
  }).catch((e) => console.error("[Analytics] Failed to update run status:", e));
}

export async function runAnalysisPipeline(params: {
  runId: string;
  influencerId: string;
  mode: AnalysisMode;
  config: AnalysisConfig;
}) {
  const { runId, influencerId, mode, config } = params;

  try {
    // ── Load influencer data ──
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      include: {
        videos: {
          orderBy: { views: "desc" },
          take: config.videosToSample,
          select: { id: true, title: true, views: true, username: true, videoUrl: true, tiktokId: true },
        },
      },
    });

    if (!influencer) {
      await updateRunStatus(runId, {
        status: "FAILED",
        progress: 0,
        progressMsg: "Influencer not found",
        errorMessage: "Influencer not found",
      });
      return;
    }

    // ── Edge case: skip if < MIN_VIDEOS ──
    if (influencer.videos.length < MIN_VIDEOS) {
      await updateRunStatus(runId, {
        status: "FAILED",
        progress: 0,
        progressMsg: `Insufficient data: only ${influencer.videos.length} videos (need ${MIN_VIDEOS}+)`,
        errorMessage: `Insufficient data: only ${influencer.videos.length} videos (minimum ${MIN_VIDEOS} required)`,
      });
      return;
    }

    // ── Step 1: Scrape comments ──
    await updateRunStatus(runId, {
      status: "SCRAPING_COMMENTS",
      progress: 5,
      progressMsg: `Scraping comments from ${influencer.videos.length} videos...`,
    });

    // Build video URLs for scraping — use stored URLs or construct from tiktokId
    const videoUrls = influencer.videos
      .map((v) => {
        if (v.videoUrl) return v.videoUrl;
        if (v.tiktokId) return `https://www.tiktok.com/@${v.username}/video/${v.tiktokId}`;
        return null;
      })
      .filter((url): url is string => url !== null);

    let scrapedComments: ScrapedComment[] = [];
    try {
      scrapedComments = await scrapeComments(
        influencer.username,
        videoUrls,
        config,
        (scraped, total) => {
          updateRunStatus(runId, {
            progress: 5 + Math.round((scraped / total) * 25),
            progressMsg: `Scraped ${scraped}/${total} comments...`,
          });
        },
      );
    } catch (err) {
      // Graceful degradation: comment scraping failure (bad Apify token, rotated key,
      // Apify outage, actor FAILED, etc.) should NOT kill the whole analytics run.
      // Continue with empty comments — downstream NLP will skip comment-based metrics
      // and analytics will still produce profile/video-based insights.
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Analytics] Comment scraping failed, continuing without comments: ${reason}`,
      );
      await updateRunStatus(runId, {
        progress: 30,
        progressMsg: `Comment scraping skipped (${reason}) — continuing analysis`,
      });
      scrapedComments = [];
    }

    // ── Low comments: warn but continue — analyze whatever is available ──
    if (scrapedComments.length === 0) {
      console.log(`[Analytics] No comments scraped for @${influencer.username}, falling back to profile-only analysis`);
      await updateRunStatus(runId, {
        progress: 30,
        progressMsg: `No comments found. Analyzing profile picture only...`,
      });
    } else if (scrapedComments.length < 50) {
      console.log(`[Analytics] Low comment count (${scrapedComments.length}) for @${influencer.username}, results may have low confidence`);
    }

    // ── Save comments to DB ──
    await prisma.comment.deleteMany({ where: { influencerId } }); // Clear old comments
    await prisma.comment.createMany({
      data: scrapedComments.map((c) => ({
        influencerId,
        text: c.text,
        username: c.username ?? null,
        avatarUrl: c.avatarUrl ?? null,
        likes: c.likes ?? 0,
        replyCount: c.replyCount ?? 0,
        videoUrl: c.videoUrl ?? null,
        commentedAt: c.commentedAt ? new Date(c.commentedAt) : null,
      })),
    });

    await updateRunStatus(runId, {
      commentCount: scrapedComments.length,
      progress: 30,
      progressMsg: `Saved ${scrapedComments.length} comments. Starting analysis...`,
    });

    // ── Step 2: Analyze influencer profile pic (Vision) ──
    let profileResult = null;
    if (mode !== "NLP_ONLY" && influencer.avatarUrl) {
      await updateRunStatus(runId, {
        progress: 35,
        progressMsg: "Analyzing influencer profile picture...",
      });

      try {
        profileResult = await analyzeInfluencerProfile(
          influencer.avatarUrl,
          influencer.biolink,
          config.geminiModel,
        );
      } catch (err) {
        console.error("[Analytics] Profile analysis failed:", err);
        // Non-fatal — continue with NLP
      }
    }

    // ── Step 3: NLP analysis on comments (skip if 0 comments) ──
    let nlpResult: AudienceNlpResult | null = null;

    if (scrapedComments.length > 0) {
      await updateRunStatus(runId, {
        status: "ANALYZING_COMMENTS",
        progress: 40,
        progressMsg: "Running NLP analysis on comments...",
      });

      const commentTexts = scrapedComments.map((c) => c.text);
      try {
        nlpResult = await analyzeAudienceComments(
          influencer.username,
          commentTexts,
          config,
          (batchIndex, totalBatches) => {
            const batchProgress = 40 + Math.round(((batchIndex + 1) / totalBatches) * 30);
            updateRunStatus(runId, {
              progress: batchProgress,
              progressMsg: `Analyzing comments batch ${batchIndex + 1}/${totalBatches}...`,
              analyzedCount: (batchIndex + 1) * config.commentBatchSize,
            });
          },
        );
      } catch (err) {
        console.error("[Analytics] NLP analysis failed:", err);
      }
    } else {
      await updateRunStatus(runId, {
        progress: 70,
        progressMsg: "No comments to analyze, using profile data only...",
      });
    }

    // ── Step 4: Avatar analysis (Hybrid/Full Vision only) ──
    let visionResult = null;
    if (mode !== "NLP_ONLY") {
      const avatarUrls = scrapedComments
        .map((c) => c.avatarUrl)
        .filter((url): url is string => !!url && url.startsWith("http"));

      const avatarsToSample = mode === "FULL_VISION"
        ? Math.min(300, avatarUrls.length)
        : Math.min(config.avatarsToAnalyze, avatarUrls.length);

      if (avatarsToSample > 0) {
        // Random sample
        const shuffled = [...avatarUrls].sort(() => Math.random() - 0.5);
        const sampled = shuffled.slice(0, avatarsToSample);

        await updateRunStatus(runId, {
          status: "ANALYZING_FACES",
          progress: 75,
          progressMsg: `Analyzing ${sampled.length} commenter avatars...`,
        });

        try {
          visionResult = await analyzeCommenterAvatars(
            sampled,
            config.geminiModel,
            (batchIndex, totalBatches) => {
              const visionProgress = 75 + Math.round(((batchIndex + 1) / totalBatches) * 20);
              updateRunStatus(runId, {
                progress: visionProgress,
                progressMsg: `Analyzing avatar batch ${batchIndex + 1}/${totalBatches}...`,
                avatarCount: (batchIndex + 1) * 20,
              });
            },
          );
        } catch (err) {
          console.error("[Analytics] Avatar analysis failed, falling back to NLP only:", err);
          // Non-fatal — fall back to NLP only
        }
      }
    }

    // ── Step 5: Merge results and save ──
    await updateRunStatus(runId, {
      progress: 95,
      progressMsg: "Merging results and saving...",
    });

    // If we have no NLP and no vision and no profile, fail gracefully
    if (!nlpResult && !visionResult && !profileResult) {
      await updateRunStatus(runId, {
        status: "FAILED",
        progress: 95,
        progressMsg: "No analyzable data available",
        errorMessage: "No analyzable data: no comments scraped, no profile picture, and no avatars analyzed",
      });
      return;
    }

    // Create a default NLP result if we have none (profile-only analysis)
    const effectiveNlp: AudienceNlpResult = nlpResult ?? {
      genderBreakdown: { male: 0, female: 0, unknown: 100 },
      ageBrackets: { "13-17": 0, "18-24": 0, "25-34": 0, "35-44": 0, "45+": 0 },
      topCountries: [],
      topInterests: [],
      audienceQuality: 0,
      confidence: 0,
      reasoning: "No comments available for NLP analysis",
    };

    const merged = mergeResults(mode, profileResult, effectiveNlp, visionResult);

    await prisma.influencerAnalytics.upsert({
      where: { influencerId },
      create: {
        influencerId,
        influencerGender: merged.influencerGender,
        influencerAgeRange: merged.influencerAgeRange,
        influencerEthnicity: merged.influencerEthnicity,
        influencerCountry: merged.influencerCountry,
        genderBreakdown: merged.genderBreakdown,
        ageBrackets: merged.ageBrackets,
        topCountries: merged.topCountries,
        ethnicityBreakdown: merged.ethnicityBreakdown ?? Prisma.JsonNull,
        topInterests: merged.topInterests,
        sentiment: merged.sentiment ?? Prisma.JsonNull,
        commentTopics: merged.commentTopics ?? Prisma.JsonNull,
        commentSummary: merged.commentSummary,
        audienceQuality: merged.audienceQuality,
        mode,
        confidence: merged.confidence,
        commentCount: scrapedComments.length,
        avatarsSampled: visionResult ? (mode === "FULL_VISION" ? 300 : config.avatarsToAnalyze) : 0,
        lastAnalyzedAt: new Date(),
        analysisRunId: runId,
      },
      update: {
        influencerGender: merged.influencerGender,
        influencerAgeRange: merged.influencerAgeRange,
        influencerEthnicity: merged.influencerEthnicity,
        influencerCountry: merged.influencerCountry,
        genderBreakdown: merged.genderBreakdown,
        ageBrackets: merged.ageBrackets,
        topCountries: merged.topCountries,
        ethnicityBreakdown: merged.ethnicityBreakdown ?? Prisma.JsonNull,
        topInterests: merged.topInterests,
        sentiment: merged.sentiment ?? Prisma.JsonNull,
        commentTopics: merged.commentTopics ?? Prisma.JsonNull,
        commentSummary: merged.commentSummary,
        audienceQuality: merged.audienceQuality,
        mode,
        confidence: merged.confidence,
        commentCount: scrapedComments.length,
        avatarsSampled: visionResult ? (mode === "FULL_VISION" ? 300 : config.avatarsToAnalyze) : 0,
        lastAnalyzedAt: new Date(),
        analysisRunId: runId,
      },
    });

    // Create activity log
    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "audience_analysis",
        title: "Audience analysis completed",
        detail: `Mode: ${mode}, Comments: ${scrapedComments.length}, Confidence: ${Math.round(merged.confidence * 100)}%`,
      },
    });

    await updateRunStatus(runId, {
      status: "COMPLETED",
      progress: 100,
      progressMsg: "Analysis complete",
    });

    // Notification
    await prisma.notification.create({
      data: {
        type: "audience_analysis",
        status: "success",
        title: `Audience analysis completed — @${influencer.username}`,
        message: `Mode: ${mode}, ${scrapedComments.length} comments analyzed, confidence: ${Math.round(merged.confidence * 100)}%`,
      },
    }).catch(() => {});

  } catch (err) {
    console.error("[Analytics] Pipeline error:", err);
    await updateRunStatus(runId, {
      status: "FAILED",
      progressMsg: `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    await checkBudgetOrThrow();
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const body = await request.json();
  const { influencerId, mode: requestedMode } = body as {
    influencerId: string;
    mode?: AnalysisMode;
  };

  if (!influencerId) {
    return NextResponse.json({ error: "influencerId is required" }, { status: 400 });
  }

  // Check if analysis is already running
  const existing = await prisma.analysisRun.findFirst({
    where: {
      influencerId,
      status: { in: ["PENDING", "SCRAPING_COMMENTS", "ANALYZING_COMMENTS", "ANALYZING_FACES"] },
    },
  });

  if (existing) {
    return NextResponse.json({
      runId: existing.id,
      status: existing.status,
      message: "Analysis already in progress",
    });
  }

  const config = await loadConfig();
  const mode = requestedMode ?? config.defaultMode;

  const run = await prisma.analysisRun.create({
    data: {
      influencerId,
      status: "PENDING",
      mode,
      config: {
        videosToSample: config.videosToSample,
        commentsPerVideo: config.commentsPerVideo,
        avatarsToAnalyze: config.avatarsToAnalyze,
        commentBatchSize: config.commentBatchSize,
      },
    },
  });

  // Run pipeline in background
  after(() =>
    runAnalysisPipeline({
      runId: run.id,
      influencerId,
      mode,
      config,
    }),
  );

  return NextResponse.json({
    runId: run.id,
    status: "PENDING",
    mode,
  });
}
