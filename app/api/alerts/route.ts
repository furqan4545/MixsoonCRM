import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// GET /api/alerts — List alert events with filtering
export async function GET(request: NextRequest) {
  try {
    await requirePermission("alerts", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status"); // ACTIVE | DISMISSED | RESOLVED
  const type = searchParams.get("type"); // APPROVAL_PENDING | EMAIL_NO_REPLY_INFLUENCER | EMAIL_NO_REPLY_US

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) {
    where.rule = { type };
  }

  try {
    const events = await prisma.alertEvent.findMany({
      where,
      include: {
        rule: { select: { type: true, thresholdDays: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("[GET /api/alerts]", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}
