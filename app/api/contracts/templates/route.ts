import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/contracts/templates — List all contract templates
export async function GET() {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const templates = await prisma.contractTemplate.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { contracts: true } },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[GET /api/contracts/templates]", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// POST /api/contracts/templates — Create a new contract template
export async function POST(request: Request) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { name, content } = body;

    if (!name || !content) {
      return NextResponse.json(
        { error: "Name and content are required" },
        { status: 400 },
      );
    }

    const template = await prisma.contractTemplate.create({
      data: { name, content },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contracts/templates]", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
