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

// PATCH /api/contracts/[id] — Update contract (status, content, admin counter-sign, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("influencers", "write");
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
    if (body.pdfUrl !== undefined) updateData.pdfUrl = body.pdfUrl;
    if (body.fields !== undefined) updateData.fields = body.fields;

    // Admin counter-signature
    if (body.adminSignatureUrl !== undefined) {
      if (user.role !== "Admin") {
        return NextResponse.json(
          { error: "Only admins can counter-sign contracts" },
          { status: 403 },
        );
      }
      updateData.adminSignatureUrl = body.adminSignatureUrl;
      updateData.adminSignedById = user.id;
      updateData.adminSignedAt = new Date();

      // If contract is SIGNED by influencer, move to ACTIVE once admin signs
      const existing = await prisma.contract.findUnique({ where: { id }, select: { status: true, influencerId: true } });
      if (existing?.status === "SIGNED") {
        updateData.status = "ACTIVE";
      }

      // Activity log
      if (existing) {
        await prisma.activityLog.create({
          data: {
            influencerId: existing.influencerId,
            type: "contract",
            title: "Admin counter-signed contract",
            detail: `Counter-signed by ${user.name || user.email}`,
          },
        });
      }
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        adminSignedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ contract });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
}
