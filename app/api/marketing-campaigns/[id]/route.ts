import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { CampaignStatus } from "@prisma/client";
import { fixThumbnailUrl } from "@/app/lib/thumbnail";

const VALID_STATUSES = Object.values(CampaignStatus);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id },
      include: {
        _count: { select: { influencers: true } },
        influencers: {
          include: {
            influencer: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                followers: true,
                platform: true,
                email: true,
                engagementRate: true,
                pipelineStage: true,
              },
            },
          },
          orderBy: { assignedAt: "desc" },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }

    // Proxy avatar URLs for assigned influencers
    const serialized = {
      ...campaign,
      startDate: campaign.startDate?.toISOString() ?? null,
      endDate: campaign.endDate?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      influencers: campaign.influencers.map((ci) => ({
        ...ci,
        assignedAt: ci.assignedAt.toISOString(),
        influencer: {
          ...ci.influencer,
          avatarProxied: fixThumbnailUrl(ci.influencer.avatarUrl),
        },
      })),
    };

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Failed to fetch marketing campaign:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, budget, startDate, endDate, status } = body as {
      name?: string;
      description?: string;
      budget?: number | null;
      startDate?: string | null;
      endDate?: string | null;
      status?: string;
    };

    if (status && !VALID_STATUSES.includes(status as CampaignStatus)) {
      return NextResponse.json(
        { error: "Invalid campaign status" },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined)
      data.description = description?.trim() || null;
    if (budget !== undefined)
      data.budget = budget != null ? Number(budget) : null;
    if (startDate !== undefined)
      data.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
      data.endDate = endDate ? new Date(endDate) : null;
    if (status !== undefined) data.status = status as CampaignStatus;

    const campaign = await prisma.marketingCampaign.update({
      where: { id },
      data,
      include: {
        _count: { select: { influencers: true } },
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Failed to update marketing campaign:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.marketingCampaign.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete marketing campaign:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 },
    );
  }
}
