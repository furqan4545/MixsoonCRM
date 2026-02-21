import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

// DELETE /api/ai/queues/:id — Remove a single evaluation from saved queue
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.influencerAiEvaluation.update({
    where: { id },
    data: { reviewStatus: "DISCARDED" },
  });

  return NextResponse.json({ success: true });
}
