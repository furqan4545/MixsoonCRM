import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { ownershipWhere } from "@/app/lib/ownership";
import { prisma } from "../../../../lib/prisma";

export async function GET(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("ai-filter", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get("importId");
    const ownership = await ownershipWhere("AiFilterRun", currentUser);

    const where: Record<string, unknown> = {};
    if (importId) where.importId = importId;
    if (ownership) Object.assign(where, ownership);

    const runs = await prisma.aiFilterRun.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(runs);
  } catch (error) {
    console.error("Fetch AI runs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI runs" },
      { status: 500 },
    );
  }
}
