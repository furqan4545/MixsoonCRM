import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/viral-alerts — list viral alerts
export async function GET(request: NextRequest) {
  await requirePermission("tracking", "read");

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "ACTIVE";

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;

  const alerts = await prisma.viralAlert.findMany({
    where,
    include: {
      trackedVideo: {
        select: { id: true, videoUrl: true, title: true, thumbnailUrl: true, currentViews: true },
      },
      influencer: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(alerts);
}
