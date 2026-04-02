import { NextResponse } from "next/server";
import { refreshTrackedVideos } from "@/app/lib/tiktok-tracker";

// GET /api/cron/refresh-tracked-videos — 5-hour cron job
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshTrackedVideos();
    return NextResponse.json({
      message: `Refreshed ${result.refreshed} videos, ${result.viralAlerts} new viral alerts`,
      ...result,
    });
  } catch (err) {
    console.error("[cron] refresh-tracked-videos error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
