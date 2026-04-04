import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getBudgetStatus, refreshBudgetCache } from "@/app/lib/budget-guard";

export async function GET() {
  try {
    const status = await getBudgetStatus(true); // force fresh read
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch budget status" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    await requirePermission("billing", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { monthlyCapUsd, gcpManualCostUsd } = body as {
      monthlyCapUsd?: number;
      gcpManualCostUsd?: number;
    };

    const data: Record<string, unknown> = {};

    if (typeof monthlyCapUsd === "number" && monthlyCapUsd >= 0) {
      data.monthlyCapUsd = monthlyCapUsd;
    }
    if (typeof gcpManualCostUsd === "number" && gcpManualCostUsd >= 0) {
      data.gcpManualCostUsd = gcpManualCostUsd;
      data.gcpCostUpdatedAt = new Date();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Upsert the config
    const config = await prisma.budgetConfig.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
    });

    refreshBudgetCache();

    // Return updated status
    const status = await getBudgetStatus(true);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update budget" },
      { status: 500 },
    );
  }
}
