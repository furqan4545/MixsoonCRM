import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get("importId");

    const runs = await prisma.aiFilterRun.findMany({
      where: importId ? { importId } : undefined,
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
