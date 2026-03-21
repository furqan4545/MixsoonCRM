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
} from "../../../lib/audience-analysis";
import type { AnalysisMode } from "@prisma/client";

export const maxDuration = 300;

const MIN_VIDEOS = 3;
const MIN_COMMENTS = 50;

async function loadConfig(): Promise<AnalysisConfig & { defaultMode: AnalysisMode }> {
  const cfg = await prisma.analysisConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    return { ...DEFAULT_CONFIG, defaultMode: "HYBRID" };
  }
  return {
    videosToSample: cfg.videosToSample,
    commentsPerVideo: cfg.commentsPerVideo,
    maxTotalComments: cfg.maxTotalComments,
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

async function runAnalysisPipeline(params: {
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
          select: { id: true, title: true, views: true, username: true },
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

    // Build video URLs for scraping
    const videoUrls = influencer.videos.map(
      (v) => `https://www.tiktok.com/@${v.username}`,
    );

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
      console.error("[Analytics] Comment scraping failed:", err);
      await updateRunStatus(runId, {
        status: "FAILED",
        progress: 5,
        progressMsg: "Comment scraping failed",
        errorMessage: `Comment scraping failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // ── Edge case: skip if < MIN_COMMENTS ──
    if (scrapedComments.length < MIN_COMMENTS) {
      await updateRunStatus(runId, {
        status: "FAILED",
        progress: 30,
        progressMsg: `Not enough engagement: only ${scrapedComments.length} comments (need ${MIN_COMMENTS}+)`,
        errorMessage: `Not enough engagement: only ${scrapedComments.length} comments (minimum ${MIN_COMMENTS} required)`,
      });
      return;
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
          config.geminiModel,
        );
      } catch (err) {
        console.error("[Analytics] Profile analysis failed:", err);
        // Non-fatal — continue with NLP
      }
    }

    // ── Step 3: NLP analysis on comments ──
    await updateRunStatus(runId, {
      status: "ANALYZING_COMMENTS",
      progress: 40,
      progressMsg: "Running NLP analysis on comments...",
    });

    const commentTexts = scrapedComments.map((c) => c.text);
    const nlpResult = await analyzeAudienceComments(
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

    const merged = mergeResults(mode, profileResult, nlpResult, visionResult);

    await prisma.influencerAnalytics.upsert({
      where: { influencerId },
      create: {
        influencerId,
        influencerGender: merged.influencerGender,
        influencerAgeRange: merged.influencerAgeRange,
        influencerEthnicity: merged.influencerEthnicity,
        genderBreakdown: merged.genderBreakdown,
        ageBrackets: merged.ageBrackets,
        topCountries: merged.topCountries,
        ethnicityBreakdown: merged.ethnicityBreakdown ?? Prisma.JsonNull,
        topInterests: merged.topInterests,
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
        genderBreakdown: merged.genderBreakdown,
        ageBrackets: merged.ageBrackets,
        topCountries: merged.topCountries,
        ethnicityBreakdown: merged.ethnicityBreakdown ?? Prisma.JsonNull,
        topInterests: merged.topInterests,
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
        maxTotalComments: config.maxTotalComments,
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
