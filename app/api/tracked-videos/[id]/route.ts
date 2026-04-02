import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/tracked-videos/[id] — detail with full snapshot history
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tracking", "read");
  const { id } = await params;

  const video = await prisma.trackedVideo.findUnique({
    where: { id },
    include: {
      influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      campaign: { select: { id: true, name: true } },
      snapshots: {
        orderBy: { recordedAt: "asc" },
        take: 90, // last 90 days
      },
      viralAlerts: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(video);
}

// PATCH /api/tracked-videos/[id] — toggle tracking
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tracking", "write");
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.isTracking !== undefined) data.isTracking = body.isTracking;
  if (body.campaignId !== undefined) data.campaignId = body.campaignId || null;

  const updated = await prisma.trackedVideo.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/tracked-videos/[id] — stop tracking and remove
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tracking", "delete");
  const { id } = await params;

  await prisma.trackedVideo.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
