import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { CampaignStatus, Prisma } from "@prisma/client";

const VALID_STATUSES = Object.values(CampaignStatus);

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.role === "Admin";

    // For PICs, only return campaigns that contain influencers assigned to them
    const where: Prisma.MarketingCampaignWhereInput = {};
    if (!isAdmin && currentUser) {
      where.influencers = {
        some: {
          influencer: {
            pics: { some: { userId: currentUser.id } },
          },
        },
      };
    }

    const campaigns = await prisma.marketingCampaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { influencers: true, shipments: true } },
      },
    });
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Failed to fetch marketing campaigns:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, budget, startDate, endDate, status } = body as {
      name?: string;
      description?: string;
      budget?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
    };

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 },
      );
    }

    if (status && !VALID_STATUSES.includes(status as CampaignStatus)) {
      return NextResponse.json(
        { error: "Invalid campaign status" },
        { status: 400 },
      );
    }

    const campaign = await prisma.marketingCampaign.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        budget: budget != null ? Number(budget) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: (status as CampaignStatus) ?? "PLANNING",
      },
      include: {
        _count: { select: { influencers: true } },
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("Failed to create marketing campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 },
    );
  }
}
