import { NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { checkAlerts } from "@/app/lib/alert-checker";

// POST /api/alerts/check — Trigger alert scan
export async function POST() {
  try {
    await requirePermission("alerts", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const result = await checkAlerts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/alerts/check]", error);
    return NextResponse.json(
      { error: "Failed to check alerts" },
      { status: 500 },
    );
  }
}
