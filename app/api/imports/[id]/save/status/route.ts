import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const record = await prisma.import.findUnique({
    where: { id },
    select: {
      status: true,
      saveProgress: true,
      saveTotal: true,
      errorMessage: true,
    },
  });

  if (!record) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json(record);
}
