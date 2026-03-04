import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { createNotification } from "@/app/lib/notifications";

// POST /api/approvals — PIC submits an approval request
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requirePermission("approvals", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    influencerId, rate, currency, deliverables, notes, campaignId,
    videosPerBundle, ratePerVideo, totalPriceLocal, totalPriceUsd,
    profileLink, picFeedback,
  } = body as {
    influencerId?: string;
    rate?: number;
    currency?: string;
    deliverables?: string;
    notes?: string;
    campaignId?: string;
    videosPerBundle?: number;
    ratePerVideo?: number;
    totalPriceLocal?: number;
    totalPriceUsd?: number;
    profileLink?: string;
    picFeedback?: string;
  };

  if (!influencerId || !rate || !deliverables) {
    return NextResponse.json(
      { error: "influencerId, rate, and deliverables are required" },
      { status: 400 },
    );
  }

  try {
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      select: { id: true, username: true },
    });
    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 },
      );
    }

    const approval = await prisma.approvalRequest.create({
      data: {
        influencerId,
        submittedById: user.id,
        rate: Number(rate),
        currency: (currency ?? "USD").trim(),
        deliverables: String(deliverables).trim(),
        notes: notes?.trim() || null,
        campaignId: campaignId || null,
        videosPerBundle: videosPerBundle != null ? Number(videosPerBundle) : null,
        ratePerVideo: ratePerVideo != null ? Number(ratePerVideo) : null,
        totalPriceLocal: totalPriceLocal != null ? Number(totalPriceLocal) : null,
        totalPriceUsd: totalPriceUsd != null ? Number(totalPriceUsd) : null,
        profileLink: profileLink?.trim() || null,
        picFeedback: picFeedback?.trim() || null,
      },
      include: {
        influencer: { select: { id: true, username: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    // Activity log on influencer
    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "approval_submitted",
        title: "Approval request submitted",
        detail: `Rate: ${(currency ?? "USD").trim()} ${Number(rate)} | ${String(deliverables).trim()}`,
      },
    });

    // Notify admins
    await createNotification({
      type: "approval",
      status: "info",
      title: "New approval request",
      message: `${user.name || user.email} submitted approval for @${influencer.username} — ${(currency ?? "USD").trim()} ${Number(rate)}`,
      approvalId: approval.id,
    });

    return NextResponse.json(approval, { status: 201 });
  } catch (error) {
    console.error("[POST /api/approvals]", error);
    return NextResponse.json(
      { error: "Failed to create approval" },
      { status: 500 },
    );
  }
}

// GET /api/approvals — List approvals (Admin sees all, PIC sees own)
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requirePermission("approvals", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {};

    // PIC sees only their own submissions
    if (user.role !== "Admin") {
      where.submittedById = user.id;
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    const approvals = await prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            rate: true,
            followers: true,
            platform: true,
            country: true,
            engagementRate: true,
            profileUrl: true,
          },
        },
        submittedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    const pendingCount = await prisma.approvalRequest.count({
      where: {
        status: "PENDING",
        ...(user.role !== "Admin" ? { submittedById: user.id } : {}),
      },
    });

    return NextResponse.json({ approvals, pendingCount });
  } catch (error) {
    console.error("[GET /api/approvals]", error);
    return NextResponse.json(
      { approvals: [], pendingCount: 0 },
      { status: 500 },
    );
  }
}
