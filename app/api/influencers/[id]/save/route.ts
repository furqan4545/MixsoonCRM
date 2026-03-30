import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// POST /api/influencers/:id/save — Toggle saved status
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const influencer = await prisma.influencer.findUnique({
      where: { id },
      select: { savedAt: true },
    });

    if (!influencer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isSaved = !!influencer.savedAt;
    const updated = await prisma.influencer.update({
      where: { id },
      data: { savedAt: isSaved ? null : new Date() },
      select: { id: true, savedAt: true },
    });

    return NextResponse.json({
      saved: !!updated.savedAt,
      message: updated.savedAt ? "Influencer saved" : "Influencer unsaved",
    });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
