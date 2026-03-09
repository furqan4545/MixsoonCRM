import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

// GET /api/email/templates — List all email templates
export async function GET() {
  try {
    await requirePermission("email", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("[GET /api/email/templates]", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 },
    );
  }
}

// POST /api/email/templates — Create a new email template
export async function POST(request: NextRequest) {
  try {
    await requirePermission("email", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

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

  if (!name?.trim() || !subject?.trim() || !bodyHtml?.trim()) {
    return NextResponse.json(
      { error: "name, subject, and bodyHtml are required" },
      { status: 400 },
    );
  }

  try {
    const template = await prisma.emailTemplate.create({
      data: {
        name: name.trim(),
        subject: subject.trim(),
        bodyHtml: bodyHtml.trim(),
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("[POST /api/email/templates]", error);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 },
    );
  }
}
