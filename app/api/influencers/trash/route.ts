import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

/**
 * POST /api/influencers/trash
 * Bulk soft-delete (trash) or restore influencers.
 * Body: { ids: string[], restore?: boolean }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ids, restore } = body as { ids: string[]; restore?: boolean };

  if (!ids?.length) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }

  if (restore) {
    // Restore from trash
    const result = await prisma.influencer.updateMany({
      where: { id: { in: ids }, trashedAt: { not: null } },
      data: { trashedAt: null },
    });

    return NextResponse.json({
      restored: result.count,
      message: `${result.count} influencer${result.count !== 1 ? "s" : ""} restored`,
    });
  }

  // Soft-delete: move to trash
  const result = await prisma.influencer.updateMany({
    where: { id: { in: ids }, trashedAt: null },
    data: { trashedAt: new Date() },
  });

  // Clear autoDeleteAt on linked imports (user took action)
  const influencers = await prisma.influencer.findMany({
    where: { id: { in: ids } },
    select: { importId: true },
  });
  const importIds = [...new Set(influencers.map((i) => i.importId).filter(Boolean))] as string[];
  if (importIds.length > 0) {
    await prisma.import.updateMany({
      where: { id: { in: importIds }, autoDeleteAt: { not: null } },
      data: { autoDeleteAt: null },
    });
  }

  return NextResponse.json({
    trashed: result.count,
    message: `${result.count} influencer${result.count !== 1 ? "s" : ""} moved to trash`,
  });
}
