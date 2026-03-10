import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

/**
 * POST /api/contracts/from-template
 * Takes a template + influencer + optional campaign, fills placeholders,
 * creates a Contract in DRAFT status.
 */
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
      templateId,
      influencerId,
      campaignId,
      rate,
      currency = "USD",
      deliverables,
      startDate,
      endDate,
    } = body;

    if (!templateId || !influencerId) {
      return NextResponse.json(
        { error: "templateId and influencerId are required" },
        { status: 400 },
      );
    }

    // Fetch template
    const template = await prisma.contractTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    // Fetch influencer
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        platform: true,
        followers: true,
        country: true,
        rate: true,
      },
    });
    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 },
      );
    }

    // Fetch campaign if provided
    let campaign: { id: string; name: string } | null = null;
    if (campaignId) {
      campaign = await prisma.marketingCampaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true },
      });
    }

    // Build replacement map
    const effectiveRate = rate ?? influencer.rate ?? "";
    const now = new Date();
    const replacements: Record<string, string> = {
      "{{influencer_name}}": influencer.displayName || influencer.username,
      "{{influencer_username}}": `@${influencer.username}`,
      "{{rate}}": effectiveRate ? String(effectiveRate) : "",
      "{{currency}}": currency,
      "{{deliverables}}": deliverables || "",
      "{{start_date}}": startDate
        ? new Date(startDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "",
      "{{end_date}}": endDate
        ? new Date(endDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "",
      "{{campaign_name}}": campaign?.name || "",
      "{{date}}": now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    // Replace all placeholders
    let filledContent = template.content;
    for (const [placeholder, value] of Object.entries(replacements)) {
      filledContent = filledContent.replaceAll(placeholder, value);
    }

    // Create contract
    const contract = await prisma.contract.create({
      data: {
        influencerId,
        campaignId: campaignId || null,
        templateId,
        filledContent,
        rate: effectiveRate ? parseFloat(String(effectiveRate)) : null,
        currency,
        deliverables: deliverables || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: "DRAFT",
      },
      include: {
        template: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "contract",
        title: "Contract created",
        detail: `Draft from template "${template.name}"${effectiveRate ? ` — ${currency} ${effectiveRate}` : ""}`,
      },
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts/from-template]", error);
    return NextResponse.json(
      { error: "Failed to create contract" },
      { status: 500 },
    );
  }
}
