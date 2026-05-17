import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { assertCanAccess } from "@/app/lib/ownership";
import { prisma } from "../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let currentUser;
  try {
    currentUser = await requirePermission("ai-filter", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }
    try {
      await assertCanAccess({
        resourceType: "Campaign",
        resourceId: id,
        user: currentUser,
        ownerId: campaign.createdById,
        required: "read",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }
    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Fetch campaign error:", error);
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
  let currentUser;
  try {
    currentUser = await requirePermission("ai-filter", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;

    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      await assertCanAccess({
        resourceType: "Campaign",
        resourceId: id,
        user: currentUser,
        ownerId: existing.createdById,
        required: "write",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      name,
      notes,
      strictnessDefault,
      targetKeywords,
      avoidKeywords,
      maxDaysSinceLastPost,
      minFollowers,
      minVideoCount,
      minTotalSaves,
    } = body as {
      name?: string;
      notes?: string | null;
      strictnessDefault?: number;
      targetKeywords?: string[];
      avoidKeywords?: string[];
      maxDaysSinceLastPost?: number | null;
      minFollowers?: number | null;
      minVideoCount?: number | null;
      minTotalSaves?: number | null;
    };

    const normalizePositiveInt = (v: unknown): number | null => {
      if (v === null || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    };

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(strictnessDefault !== undefined
          ? {
              strictnessDefault: Math.max(
                0,
                Math.min(100, Number(strictnessDefault)),
              ),
            }
          : {}),
        ...(targetKeywords !== undefined
          ? {
              targetKeywords: targetKeywords
                .map((k) => k.trim())
                .filter(Boolean),
            }
          : {}),
        ...(avoidKeywords !== undefined
          ? {
              avoidKeywords: avoidKeywords.map((k) => k.trim()).filter(Boolean),
            }
          : {}),
        ...(maxDaysSinceLastPost !== undefined
          ? { maxDaysSinceLastPost: normalizePositiveInt(maxDaysSinceLastPost) }
          : {}),
        ...(minFollowers !== undefined
          ? { minFollowers: normalizePositiveInt(minFollowers) }
          : {}),
        ...(minVideoCount !== undefined
          ? { minVideoCount: normalizePositiveInt(minVideoCount) }
          : {}),
        ...(minTotalSaves !== undefined
          ? { minTotalSaves: normalizePositiveInt(minTotalSaves) }
          : {}),
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Update campaign error:", error);
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
  let currentUser;
  try {
    currentUser = await requirePermission("ai-filter", "delete");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;

    const existing = await prisma.campaign.findUnique({
      where: { id },
      select: { createdById: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      await assertCanAccess({
        resourceType: "Campaign",
        resourceId: id,
        user: currentUser,
        ownerId: existing.createdById,
        required: "admin",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }

    await prisma.campaign.delete({ where: { id } });

    await prisma.notification.create({
      data: {
        type: "campaign_deleted",
        status: "warning",
        title: `Campaign deleted: ${existing.name}`,
        message: `${currentUser.name ?? currentUser.email ?? "user"} deleted campaign "${existing.name}".`,
        userId: currentUser.id,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete campaign error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 },
    );
  }
}
