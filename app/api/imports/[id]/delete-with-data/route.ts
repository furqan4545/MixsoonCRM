import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { assertCanAccess } from "@/app/lib/ownership";
import { deleteImportMediaFromGcs } from "../../../../lib/gcs-media";
import { prisma } from "../../../../lib/prisma";

// DELETE /api/imports/:id/delete-with-data — Hard delete: remove import + all linked influencers + their videos
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "delete");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;

    // Ownership check — prevent admins from deleting each other's CSVs
    const importRow = await prisma.import.findUnique({
      where: { id },
      select: { createdById: true, sourceFilename: true },
    });
    if (!importRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    try {
      await assertCanAccess({
        resourceType: "Import",
        resourceId: id,
        user: currentUser,
        ownerId: importRow.createdById,
        required: "admin",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }

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

    // Audit trail — record the destructive action so we can investigate later
    await prisma.notification.create({
      data: {
        type: "import_hard_deleted",
        status: "warning",
        title: `CSV deleted: ${importRow.sourceFilename}`,
        message: `${currentUser.name ?? currentUser.email ?? "user"} hard-deleted "${importRow.sourceFilename}" along with ${influencerIds.length} influencer${influencerIds.length !== 1 ? "s" : ""} and their data.`,
        userId: currentUser.id,
      },
    }).catch(() => {});

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
