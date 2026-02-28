import { type NextRequest, NextResponse } from "next/server";
import {
  isSaveStoppedMessage,
  SAVE_STOP_REQUESTED,
} from "@/app/lib/import-save";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../lib/prisma";

const SAVE_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.SAVE_STALE_AFTER_MS ?? 30 * 60 * 1000) || 30 * 60 * 1000,
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("imports", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const record = await prisma.import.findUnique({
    where: { id },
    select: {
      status: true,
      saveProgress: true,
      saveTotal: true,
      errorMessage: true,
      updatedAt: true,
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  if (
    record.status === "PROCESSING" &&
    Date.now() - record.updatedAt.getTime() > SAVE_STALE_AFTER_MS
  ) {
    const stalled = await prisma.import.update({
      where: { id },
      data: {
        status: "DRAFT",
        errorMessage: `Save job stalled at ${record.saveProgress}/${record.saveTotal}. Please retry.`,
      },
      select: {
        status: true,
        saveProgress: true,
        saveTotal: true,
        errorMessage: true,
      },
    });
    return NextResponse.json({
      ...stalled,
      stopRequested: false,
    });
  }

  return NextResponse.json({
    status: record.status,
    saveProgress: record.saveProgress,
    saveTotal: record.saveTotal,
    errorMessage:
      record.errorMessage === SAVE_STOP_REQUESTED ? null : record.errorMessage,
    stopRequested:
      record.status === "PROCESSING" &&
      record.errorMessage === SAVE_STOP_REQUESTED,
    stopped: isSaveStoppedMessage(record.errorMessage),
  });
}
