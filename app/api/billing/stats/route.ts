import { type NextRequest, NextResponse } from "next/server";
import { getUsageStats } from "../../../lib/usage-tracking";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const importId = searchParams.get("importId") ?? undefined;

  try {
    const stats = await getUsageStats({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      importId,
    });
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
