import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { influencerIds } = body as { influencerIds: string[] };

    if (!Array.isArray(influencerIds) || influencerIds.length === 0) {
      return NextResponse.json(
        { error: "influencerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    // Verify campaign exists
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }

    // Create assignments (skip duplicates)
    const result = await prisma.campaignInfluencer.createMany({
      data: influencerIds.map((influencerId) => ({
        campaignId,
        influencerId,
      })),
      skipDuplicates: true,
    });

    // Create activity logs for each assigned influencer
    await prisma.activityLog.createMany({
      data: influencerIds.map((influencerId) => ({
        influencerId,
        type: "campaign_assigned",
        title: "Assigned to campaign",
        detail: campaign.name,
      })),
    });

    return NextResponse.json({
      assigned: result.count,
      campaignId,
    });
  } catch (error) {
    console.error("Failed to assign influencers:", error);
    return NextResponse.json(
      { error: "Failed to assign influencers" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { influencerIds } = body as { influencerIds: string[] };

    if (!Array.isArray(influencerIds) || influencerIds.length === 0) {
      return NextResponse.json(
        { error: "influencerIds must be a non-empty array" },
        { status: 400 },
      );
    }

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    });

    const result = await prisma.campaignInfluencer.deleteMany({
      where: {
        campaignId,
        influencerId: { in: influencerIds },
      },
    });

    // Create activity logs for removal
    await prisma.activityLog.createMany({
      data: influencerIds.map((influencerId) => ({
        influencerId,
        type: "campaign_removed",
        title: "Removed from campaign",
        detail: campaign?.name ?? campaignId,
      })),
    });

    return NextResponse.json({
      removed: result.count,
      campaignId,
    });
  } catch (error) {
    console.error("Failed to unassign influencers:", error);
    return NextResponse.json(
      { error: "Failed to unassign influencers" },
      { status: 500 },
    );
  }
}
