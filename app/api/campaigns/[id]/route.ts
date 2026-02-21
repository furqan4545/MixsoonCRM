import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Fetch campaign error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      notes,
      strictnessDefault,
      targetKeywords,
      avoidKeywords,
    } = body as {
      name?: string;
      notes?: string | null;
      strictnessDefault?: number;
      targetKeywords?: string[];
      avoidKeywords?: string[];
    };

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(strictnessDefault !== undefined
          ? {
              strictnessDefault: Math.max(
                0,
                Math.min(100, Number(strictnessDefault)),
              ),
            }
          : {}),
        ...(targetKeywords !== undefined
          ? {
              targetKeywords: targetKeywords
                .map((k) => k.trim())
                .filter(Boolean),
            }
          : {}),
        ...(avoidKeywords !== undefined
          ? {
              avoidKeywords: avoidKeywords.map((k) => k.trim()).filter(Boolean),
            }
          : {}),
      },
    });

    return NextResponse.json(campaign);
  } catch (error) {
    console.error("Update campaign error:", error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("ai-filter", "delete");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete campaign error:", error);
    return NextResponse.json(
      { error: "Failed to delete campaign" },
      { status: 500 },
    );
  }
}
