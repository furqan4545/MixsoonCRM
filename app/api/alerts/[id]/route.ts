import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// PATCH /api/alerts/:id — Dismiss or resolve an alert
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("alerts", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body as { action?: string };
  if (!action || !["dismiss", "resolve"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'dismiss' or 'resolve'" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.alertEvent.update({
      where: { id },
      data: {
        status: action === "dismiss" ? "DISMISSED" : "RESOLVED",
        ...(action === "dismiss"
          ? { dismissedAt: new Date() }
          : { resolvedAt: new Date() }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/alerts/:id]", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 },
    );
  }
}
