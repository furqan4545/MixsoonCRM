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
      activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { emailMessages: true, videos: true } },
      aiEvaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { score: true },
      },
      analytics: {
        select: {
          influencerGender: true,
          influencerAgeRange: true,
          influencerEthnicity: true,
          influencerCountry: true,
        },
      },
    },
  });

  if (!influencer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(influencer);
}
