import { NextRequest, NextResponse } from "next/server";
import { SAVE_STOP_REQUESTED } from "@/app/lib/import-save";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("imports", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const current = await prisma.import.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }
  if (current.status !== "PROCESSING") {
    return NextResponse.json(
      { error: "No active save job for this import" },
      { status: 400 },
    );
  }

  await prisma.import.update({
    where: { id },
    data: { errorMessage: SAVE_STOP_REQUESTED },
  });

  return NextResponse.json({ stopping: true }, { status: 202 });
}
