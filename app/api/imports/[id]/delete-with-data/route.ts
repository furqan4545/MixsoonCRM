import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { deleteImportMediaFromGcs } from "../../../../lib/gcs-media";
import { prisma } from "../../../../lib/prisma";

// DELETE /api/imports/:id/delete-with-data — Hard delete: remove import + all linked influencers + their videos
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("imports", "delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const mediaDelete = await deleteImportMediaFromGcs(id);

    // Find all influencers linked to this import
    const influencers = await prisma.influencer.findMany({
      where: { importId: id },
      select: { id: true },
    });

    const influencerIds = influencers.map((i) => i.id);

    // Delete all videos belonging to these influencers
    if (influencerIds.length > 0) {
      await prisma.video.deleteMany({
        where: { influencerId: { in: influencerIds } },
      });

      // Delete the influencers
      await prisma.influencer.deleteMany({
        where: { id: { in: influencerIds } },
      });
    }

    // Delete the import record
    await prisma.import.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      mode: "hard",
      deletedInfluencers: influencerIds.length,
      deletedMediaFiles: mediaDelete.deletedCount,
      failedMediaDeletes: mediaDelete.failedCount,
    });
  } catch (error) {
    console.error("Hard delete import error:", error);
    return NextResponse.json(
      { error: "Failed to delete import with data" },
      { status: 500 },
    );
  }
}
