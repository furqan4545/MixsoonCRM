import { after, type NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  analyzeInfluencerProfile,
  analyzeAudienceComments,
  analyzeCommenterAvatars,
  mergeResults,
  DEFAULT_CONFIG,
} from "../../../lib/audience-analysis";
import type { AnalysisMode } from "@prisma/client";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { influencerId, mode: requestedMode } = (await request.json()) as {
    influencerId: string;
    mode?: AnalysisMode;
  };

  if (!influencerId) {
    return NextResponse.json({ error: "influencerId is required" }, { status: 400 });
  }

  const comments = await prisma.comment.findMany({
    where: { influencerId },
    select: { text: true, avatarUrl: true },
  });

  if (comments.length < 50) {
    return NextResponse.json(
      { error: `Not enough comments: ${comments.length} (need 50+)` },
      { status: 400 },
    );
  }

  const influencer = await prisma.influencer.findUnique({
    where: { id: influencerId },
    select: { username: true, avatarUrl: true },
  });

  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  const cfg = await prisma.analysisConfig.findUnique({ where: { id: "default" } });
  const mode = requestedMode ?? cfg?.defaultMode ?? "HYBRID";
  const geminiModel = cfg?.geminiModel ?? DEFAULT_CONFIG.geminiModel;
  const config = { ...DEFAULT_CONFIG, geminiModel };

  const run = await prisma.analysisRun.create({
    data: {
      influencerId,
      status: "ANALYZING_COMMENTS",
      mode,
      commentCount: comments.length,
    },
  });

  after(async () => {
    try {
      // Profile analysis
      let profileResult = null;
      if (mode !== "NLP_ONLY" && influencer.avatarUrl) {
        try {
          profileResult = await analyzeInfluencerProfile(influencer.avatarUrl, geminiModel);
        } catch {}
      }

      // NLP
      const commentTexts = comments.map((c) => c.text);
      const nlpResult = await analyzeAudienceComments(
        influencer.username,
        commentTexts,
        config,
      );

      // Vision
      let visionResult = null;
      if (mode !== "NLP_ONLY") {
        const avatarUrls = comments
          .map((c) => c.avatarUrl)
          .filter((u): u is string => !!u && u.startsWith("http"));

        const sampleSize = mode === "FULL_VISION" ? 300 : (cfg?.avatarsToAnalyze ?? 100);
        const sampled = [...avatarUrls]
          .sort(() => Math.random() - 0.5)
          .slice(0, sampleSize);

        if (sampled.length > 0) {
          try {
            visionResult = await analyzeCommenterAvatars(sampled, geminiModel);
          } catch {}
        }
      }

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
          commentCount: comments.length,
          avatarsSampled: visionResult ? (mode === "FULL_VISION" ? 300 : (cfg?.avatarsToAnalyze ?? 100)) : 0,
          lastAnalyzedAt: new Date(),
          analysisRunId: run.id,
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
          commentCount: comments.length,
          avatarsSampled: visionResult ? (mode === "FULL_VISION" ? 300 : (cfg?.avatarsToAnalyze ?? 100)) : 0,
          lastAnalyzedAt: new Date(),
          analysisRunId: run.id,
        },
      });

      await prisma.analysisRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", progress: 100, progressMsg: "Analysis complete" },
      });
    } catch (err) {
      await prisma.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      }).catch(() => {});
    }
  });

  return NextResponse.json({ runId: run.id, status: "ANALYZING_COMMENTS" });
}
