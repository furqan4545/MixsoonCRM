import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/contracts/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      influencer: {
        select: { id: true, username: true, displayName: true, email: true },
      },
      campaign: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  return NextResponse.json({ contract });
}

// PATCH /api/contracts/[id] — Update contract (status, content, etc.)
export async function PATCH(
  request: NextRequest,
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
  const body = await request.json();

  try {
    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.filledContent !== undefined) updateData.filledContent = body.filledContent;
    if (body.rate !== undefined) updateData.rate = body.rate ? parseFloat(body.rate) : null;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.deliverables !== undefined) updateData.deliverables = body.deliverables;
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ contract });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
}
