import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// GET /api/alerts/rules — List all alert rules
export async function GET() {
  try {
    await requirePermission("alerts", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const rules = await prisma.alertRule.findMany({
      include: {
        template: { select: { id: true, name: true } },
        _count: { select: { events: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { type: "asc" },
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("[GET /api/alerts/rules]", error);
    return NextResponse.json(
      { error: "Failed to fetch rules" },
      { status: 500 },
    );
  }
}

// PATCH /api/alerts/rules — Bulk update alert rules
export async function PATCH(request: NextRequest) {
  try {
    await requirePermission("alerts", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rules } = body as {
    rules?: {
      id: string;
      thresholdDays?: number;
      enabled?: boolean;
      templateId?: string | null;
    }[];
  };

  if (!rules || !Array.isArray(rules)) {
    return NextResponse.json(
      { error: "rules array required" },
      { status: 400 },
    );
  }

  try {
    const results = await Promise.all(
      rules.map((r) =>
        prisma.alertRule.update({
          where: { id: r.id },
          data: {
            ...(r.thresholdDays !== undefined
              ? { thresholdDays: r.thresholdDays }
              : {}),
            ...(r.enabled !== undefined ? { enabled: r.enabled } : {}),
            ...(r.templateId !== undefined
              ? { templateId: r.templateId || null }
              : {}),
          },
          include: {
            template: { select: { id: true, name: true } },
          },
        }),
      ),
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("[PATCH /api/alerts/rules]", error);
    return NextResponse.json(
      { error: "Failed to update rules" },
      { status: 500 },
    );
  }
}
