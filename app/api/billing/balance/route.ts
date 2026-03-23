import { NextResponse } from "next/server";
import { getApifyBalance } from "../../../lib/usage-tracking";

export async function GET() {
  try {
    const balance = await getApifyBalance();
    return NextResponse.json(balance);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
