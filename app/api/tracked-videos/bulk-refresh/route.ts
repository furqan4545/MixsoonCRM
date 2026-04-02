import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { refreshTrackedVideos } from "@/app/lib/tiktok-tracker";

// POST /api/tracked-videos/bulk-refresh — refresh all tracked videos
export async function POST(_request: NextRequest) {
  const user = await requirePermission("tracking", "write");
  const result = await refreshTrackedVideos(undefined, user.id);
  return NextResponse.json(result);
}
