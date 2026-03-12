import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/contracts — List contracts, optionally filtered by influencerId
export async function GET(request: NextRequest) {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const influencerId = request.nextUrl.searchParams.get("influencerId");
    const where: Record<string, unknown> = {};
    if (influencerId) where.influencerId = influencerId;

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: {
          select: { id: true, username: true, displayName: true },
        },
        campaign: {
          select: { id: true, name: true },
        },
        template: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ contracts });
  } catch (error) {
    console.error("[GET /api/contracts]", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
}

// POST /api/contracts — Create a new contract
export async function POST(request: Request) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const {
      influencerId,
      campaignId,
      templateId,
      filledContent,
      rate,
      currency = "USD",
      deliverables,
      startDate,
      endDate,
      requireBankDetails = false,
      requireShippingAddress = false,
    } = body;

    if (!influencerId) {
      return NextResponse.json(
        { error: "influencerId is required" },
        { status: 400 },
      );
    }

    const contract = await prisma.contract.create({
      data: {
        influencerId,
        campaignId: campaignId || null,
        templateId: templateId || null,
        filledContent: filledContent || null,
        rate: rate ? parseFloat(rate) : null,
        currency,
        deliverables: deliverables || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        requireBankDetails: !!requireBankDetails,
        requireShippingAddress: !!requireShippingAddress,
        status: "DRAFT",
      },
    });

    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "contract",
        title: "Contract created",
        detail: `Draft contract created${rate ? ` — ${currency} ${rate}` : ""}`,
      },
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts]", error);
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 });
  }
}
