import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../lib/prisma";

// GET /api/imports/:id — Get single import with influencers and videos
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("imports", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      return NextResponse.json(
        { error: "Import not found" },
        { status: 404 },
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
  try {
    await requirePermission("imports", "delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;

    // Unlink influencers from this import (set importId to null)
    await prisma.influencer.updateMany({
      where: { importId: id },
      data: { importId: null },
    });

    // Delete the import record
    await prisma.import.delete({ where: { id } });

    return NextResponse.json({ success: true, mode: "soft" });
  } catch (error) {
    console.error("Delete import error:", error);
    return NextResponse.json(
      { error: "Failed to delete import" },
      { status: 500 },
    );
  }
}
