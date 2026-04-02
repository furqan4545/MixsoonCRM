import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { refreshTrackedVideos } from "@/app/lib/tiktok-tracker";

// POST /api/tracked-videos/[id]/refresh — refresh single video stats
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("tracking", "read");
  const { id } = await params;

  const result = await refreshTrackedVideos([id]);
  return NextResponse.json(result);
}
