import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/contracts/templates/[id]
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

  const template = await prisma.contractTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ template });
}

// PATCH /api/contracts/templates/[id]
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
  const { name, content } = body;

  try {
    const template = await prisma.contractTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(content !== undefined ? { content } : {}),
      },
    });

    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
}

// DELETE /api/contracts/templates/[id]
export async function DELETE(
  _request: NextRequest,
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

  try {
    await prisma.contractTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
}
