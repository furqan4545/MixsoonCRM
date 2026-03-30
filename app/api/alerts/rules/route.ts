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
    // Auto-create missing alert types
    const ALL_TYPES = [
      "APPROVAL_PENDING",
      "EMAIL_NO_REPLY_INFLUENCER",
      "EMAIL_NO_REPLY_US",
      "CONTRACT_EXPIRING",
      "CONTENT_OVERDUE",
      "FOLLOW_UP_REMINDER",
    ] as const;

    const existing = await prisma.alertRule.findMany({ select: { type: true } });
    const existingTypes = new Set(existing.map((r) => r.type));

    const defaults: Record<string, { days: number; severity: string }> = {
      APPROVAL_PENDING: { days: 3, severity: "MEDIUM" },
      EMAIL_NO_REPLY_INFLUENCER: { days: 3, severity: "MEDIUM" },
      EMAIL_NO_REPLY_US: { days: 1, severity: "HIGH" },
      CONTRACT_EXPIRING: { days: 7, severity: "HIGH" },
      CONTENT_OVERDUE: { days: 5, severity: "MEDIUM" },
      FOLLOW_UP_REMINDER: { days: 3, severity: "LOW" },
    };

    for (const type of ALL_TYPES) {
      if (!existingTypes.has(type)) {
        const d = defaults[type];
        await prisma.alertRule.create({
          data: {
            type,
            thresholdDays: d.days,
            severity: d.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
            enabled: true,
            escalationLayers: [],
          },
        });
      }
    }

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
      severity?: string;
      escalationLayers?: unknown[];
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
            ...(r.severity !== undefined
              ? { severity: r.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" }
              : {}),
            ...(r.escalationLayers !== undefined
              ? { escalationLayers: r.escalationLayers }
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
