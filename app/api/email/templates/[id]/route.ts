import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// PATCH /api/email/templates/:id — Update an email template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("email", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, subject, bodyHtml } = body as {
    name?: string;
    subject?: string;
    bodyHtml?: string;
  };

  const data: Record<string, string> = {};
  if (name?.trim()) data.name = name.trim();
  if (subject?.trim()) data.subject = subject.trim();
  if (bodyHtml?.trim()) data.bodyHtml = bodyHtml.trim();

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.emailTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/email/templates/:id]", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 },
    );
  }
}

// DELETE /api/email/templates/:id — Delete an email template
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("email", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    // First unlink from any rules
    await prisma.alertRule.updateMany({
      where: { templateId: id },
      data: { templateId: null },
    });

    await prisma.emailTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/email/templates/:id]", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 },
    );
  }
}
