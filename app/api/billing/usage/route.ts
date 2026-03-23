import { type NextRequest, NextResponse } from "next/server";
import { getApifyMonthlyUsage } from "../../../lib/usage-tracking";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;

  try {
    const usage = await getApifyMonthlyUsage(date);
    return NextResponse.json(usage);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch usage" },
      { status: 500 },
    );
  }
}
