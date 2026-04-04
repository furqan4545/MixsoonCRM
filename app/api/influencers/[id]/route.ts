import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { PipelineStage } from "@prisma/client";

const VALID_STAGES = Object.values(PipelineStage);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};

    // Validate and pick allowed fields
    if ("displayName" in body) data.displayName = body.displayName ?? null;
    if ("platform" in body) data.platform = body.platform ?? null;
    if ("engagementRate" in body) data.engagementRate = body.engagementRate != null ? Number(body.engagementRate) : null;
    if ("rate" in body) data.rate = body.rate != null ? Number(body.rate) : null;
    if ("country" in body) data.country = body.country ?? null;
    if ("email" in body) data.email = body.email ?? null;
    if ("phone" in body) data.phone = body.phone ?? null;
    if ("biolink" in body) data.biolink = body.biolink ?? null;
    if ("bioLinkUrl" in body) data.bioLinkUrl = body.bioLinkUrl ?? null;
    if ("language" in body) data.language = body.language ?? null;
    if ("notes" in body) data.notes = body.notes ?? null;
    if ("aiScore" in body) data.aiScore = body.aiScore != null ? Number(body.aiScore) : null;

    if ("tags" in body && Array.isArray(body.tags)) {
      data.tags = body.tags.filter((t: unknown) => typeof t === "string" && t.trim());
    }

    if ("pipelineStage" in body) {
      if (!VALID_STAGES.includes(body.pipelineStage)) {
        return NextResponse.json({ error: "Invalid pipeline stage" }, { status: 400 });
      }
      data.pipelineStage = body.pipelineStage;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const influencer = await prisma.influencer.update({
      where: { id },
      data,
    });

    // Create activity log for certain field changes
    const activityLogs: { type: string; title: string; detail: string | null }[] = [];

    if ("pipelineStage" in body) {
      const stageName = VALID_STAGES.find((s) => s === body.pipelineStage) ?? body.pipelineStage;
      activityLogs.push({
        type: "pipeline_change",
        title: "Pipeline stage changed",
        detail: `Stage: ${stageName.charAt(0) + stageName.slice(1).toLowerCase()}`,
      });
    }

    if ("tags" in body) {
      activityLogs.push({
        type: "tag_added",
        title: "Tags updated",
        detail: (body.tags as string[]).join(", "),
      });
    }

    if ("notes" in body && body.notes) {
      activityLogs.push({
        type: "note_added",
        title: "Note updated",
        detail: null,
      });
    }

    if ("email" in body) {
      activityLogs.push({
        type: "email_extracted",
        title: body.email ? "Email updated" : "Email removed",
        detail: body.email ? `Email: ${body.email}` : null,
      });
    }

    if (activityLogs.length > 0) {
      await prisma.activityLog.createMany({
        data: activityLogs.map((log) => ({
          influencerId: id,
          ...log,
        })),
      });
    }

    return NextResponse.json(influencer);
  } catch (error) {
    console.error("Failed to update influencer:", error);
    return NextResponse.json(
      { error: "Failed to update influencer" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const influencer = await prisma.influencer.findUnique({
    where: { id },
    include: {
      videos: { orderBy: { uploadedAt: "desc" } },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 30 },
      _count: { select: { emailMessages: true, videos: true } },
      import: { select: { id: true, sourceFilename: true } },
      aiEvaluations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          score: true,
          bucket: true,
          reviewStatus: true,
          reasons: true,
          matchedSignals: true,
          riskSignals: true,
          run: { select: { campaign: { select: { name: true } } } },
        },
      },
      campaignAssignments: {
        include: {
          campaign: { select: { id: true, name: true, status: true } },
        },
        orderBy: { assignedAt: "desc" },
      },
      analytics: {
        select: {
          influencerGender: true,
          influencerAgeRange: true,
          influencerEthnicity: true,
          influencerCountry: true,
          lastAnalyzedAt: true,
          mode: true,
          confidence: true,
        },
      },
      pics: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });

  if (!influencer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const savedEval = influencer.aiEvaluations.find((e) => e.reviewStatus === "SAVED");
  const latestEval = influencer.aiEvaluations[0] ?? null;

  function fixThumb(url: string | null): string | null {
    if (!url) return null;
    return `/api/thumbnail?url=${encodeURIComponent(url)}`;
  }

  return NextResponse.json({
    id: influencer.id,
    username: influencer.username,
    displayName: influencer.displayName,
    avatarUrl: influencer.avatarUrl,
    avatarProxied: fixThumb(influencer.avatarUrl),
    profileUrl: influencer.profileUrl,
    platform: influencer.platform ?? (influencer.profileUrl?.includes("tiktok") ? "TikTok" : influencer.profileUrl?.includes("instagram") ? "Instagram" : null),
    followers: influencer.followers,
    engagementRate: influencer.engagementRate,
    rate: influencer.rate,
    language: influencer.language,
    country: influencer.country,
    email: influencer.email,
    phone: influencer.phone,
    biolink: influencer.biolink,
    bioLinkUrl: influencer.bioLinkUrl,
    socialLinks: influencer.socialLinks,
    sourceFilename: influencer.sourceFilename,
    importId: influencer.import?.id ?? null,
    importFilename: influencer.import?.sourceFilename ?? null,
    pipelineStage: influencer.pipelineStage,
    tags: influencer.tags,
    notes: influencer.notes,
    aiScore: influencer.aiScore ?? latestEval?.score ?? null,
    queueBucket: savedEval?.bucket ?? null,
    queueEvalId: savedEval?.id ?? null,
    aiReasons: latestEval?.reasons ?? null,
    aiMatchedSignals: latestEval?.matchedSignals ?? null,
    aiRiskSignals: latestEval?.riskSignals ?? null,
    campaignName: latestEval?.run?.campaign?.name ?? null,
    videoCount: influencer._count.videos,
    conversationCount: influencer._count.emailMessages,
    videos: influencer.videos.map((v) => ({
      id: v.id,
      title: v.title,
      views: v.views,
      bookmarks: v.bookmarks,
      uploadedAt: v.uploadedAt?.toISOString() ?? null,
      thumbnailUrl: v.thumbnailUrl,
      thumbnailProxied: fixThumb(v.thumbnailUrl),
      videoUrl: v.videoUrl ?? null,
      tiktokId: v.tiktokId ?? null,
    })),
    activityLogs: influencer.activityLogs.map((log) => ({
      id: log.id,
      type: log.type,
      title: log.title,
      detail: log.detail,
      createdAt: log.createdAt.toISOString(),
    })),
    campaignAssignments: influencer.campaignAssignments.map((ca) => ({
      campaignId: ca.campaign.id,
      campaignName: ca.campaign.name,
      campaignStatus: ca.campaign.status,
    })),
    analytics: influencer.analytics ?? null,
    pics: influencer.pics.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      email: p.user.email,
    })),
    savedAt: influencer.savedAt?.toISOString() ?? null,
    createdAt: influencer.createdAt.toISOString(),
  });
}
