import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { refreshBudgetCache, getBudgetStatus } from "@/app/lib/budget-guard";

export async function POST(req: Request) {
  let user;
  try {
    user = await requirePermission("billing", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { blocked } = body as { blocked: boolean };

    if (typeof blocked !== "boolean") {
      return NextResponse.json({ error: "blocked (boolean) is required" }, { status: 400 });
    }

    const userId = user?.id ?? null;

    if (blocked) {
      await prisma.budgetConfig.upsert({
        where: { id: "default" },
        update: {
          isBlocked: true,
          blockedAt: new Date(),
          blockedByUserId: userId,
          blockReason: "manual",
        },
        create: {
          id: "default",
          isBlocked: true,
          blockedAt: new Date(),
          blockedByUserId: userId,
          blockReason: "manual",
        },
      });
    } else {
      await prisma.budgetConfig.upsert({
        where: { id: "default" },
        update: {
          isBlocked: false,
          unblockedAt: new Date(),
          unblockedByUserId: userId,
          blockReason: null,
        },
        create: {
          id: "default",
          isBlocked: false,
          unblockedAt: new Date(),
          unblockedByUserId: userId,
        },
      });
    }

    refreshBudgetCache();

    const status = await getBudgetStatus(true);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to toggle block status" },
      { status: 500 },
    );
  }
}
