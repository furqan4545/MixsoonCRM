import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { assertCanAccess } from "@/app/lib/ownership";
import { prisma } from "../../../lib/prisma";

// GET /api/imports/:id — Get single import with influencers and videos
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const importRecord = await prisma.import.findUnique({
      where: { id },
      include: {
        influencers: {
          include: {
            videos: {
              orderBy: { uploadedAt: "desc" },
            },
          },
          orderBy: { username: "asc" },
        },
      },
    });

    if (!importRecord) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    try {
      await assertCanAccess({
        resourceType: "Import",
        resourceId: id,
        user: currentUser,
        ownerId: importRecord.createdById,
        required: "read",
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }

    return NextResponse.json(importRecord);
  } catch (error) {
    console.error("Fetch import error:", error);
    return NextResponse.json(
      { error: "Failed to fetch import" },
      { status: 500 },
    );
  }
}

// DELETE /api/imports/:id — Soft delete: remove import record only, unlink influencers
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

    // Unlink influencers from this import (set importId to null)
    await prisma.influencer.updateMany({
      where: { importId: id },
      data: { importId: null },
    });

    // Delete the import record
    await prisma.import.delete({ where: { id } });

    await prisma.notification.create({
      data: {
        type: "import_unlinked",
        status: "info",
        title: `Import unlinked: ${importRow.sourceFilename}`,
        message: `${currentUser.name ?? currentUser.email ?? "user"} removed the import record (influencers preserved as orphans).`,
        userId: currentUser.id,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, mode: "soft" });
  } catch (error) {
    console.error("Delete import error:", error);
    return NextResponse.json(
      { error: "Failed to delete import" },
      { status: 500 },
    );
  }
}
