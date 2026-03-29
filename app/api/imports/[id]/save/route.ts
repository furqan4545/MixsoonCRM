import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { processGcsSave, isStale } from "@/app/lib/gcs-save";
import { prisma } from "../../../../lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const importRecord = await prisma.import.findUnique({
    where: { id },
    select: {
      status: true,
      updatedAt: true,
      influencers: { select: { id: true } },
    },
  });

  if (!importRecord) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  let effectiveStatus = importRecord.status;
  if (effectiveStatus === "PROCESSING" && isStale(importRecord.updatedAt)) {
    await prisma.import.update({
      where: { id },
      data: {
        status: "DRAFT",
        errorMessage: "Previous save job became stale. Please retry.",
      },
    });
    effectiveStatus = "DRAFT";
  }

  if (
    effectiveStatus !== "DRAFT" &&
    effectiveStatus !== "COMPLETED" &&
    effectiveStatus !== "FAILED"
  ) {
    return NextResponse.json(
      { error: `Import is already ${effectiveStatus}` },
      { status: 400 },
    );
  }

  const total = importRecord.influencers.length;

  await prisma.import.update({
    where: { id },
    data: {
      status: "PROCESSING",
      saveProgress: 0,
      saveTotal: total,
      errorMessage: null,
    },
  });

  processGcsSave(id).catch((err) => console.error("[save] Unhandled:", err));

  // Auto-assign uploading user as PIC to all influencers in this import
  if (currentUser?.id && importRecord.influencers.length > 0) {
    const infIds = importRecord.influencers.map((i) => i.id);
    prisma.influencerPic.createMany({
      data: infIds.map((infId) => ({
        influencerId: infId,
        userId: currentUser.id,
      })),
      skipDuplicates: true,
    }).catch((err) => console.error("[save] PIC assignment error:", err));
  }

  return NextResponse.json({ started: true, total }, { status: 202 });
}
