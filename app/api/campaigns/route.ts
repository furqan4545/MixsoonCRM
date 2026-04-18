import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../lib/prisma";

export async function GET() {
  try {
    await requirePermission("ai-filter", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("Fetch campaigns error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("ai-filter", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const {
      name,
      notes,
      strictnessDefault = 50,
      targetKeywords = [],
      avoidKeywords = [],
      maxDaysSinceLastPost,
      minFollowers,
      minVideoCount,
    } = body as {
      name: string;
      notes?: string;
      strictnessDefault?: number;
      targetKeywords?: string[];
      avoidKeywords?: string[];
      maxDaysSinceLastPost?: number | null;
      minFollowers?: number | null;
      minVideoCount?: number | null;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const normalizePositiveInt = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    };

    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        notes: notes?.trim() || null,
        strictnessDefault: Math.max(
          0,
          Math.min(100, Number(strictnessDefault)),
        ),
        targetKeywords: targetKeywords.map((k) => k.trim()).filter(Boolean),
        avoidKeywords: avoidKeywords.map((k) => k.trim()).filter(Boolean),
        maxDaysSinceLastPost:
          maxDaysSinceLastPost === undefined
            ? 30
            : normalizePositiveInt(maxDaysSinceLastPost),
        minFollowers: normalizePositiveInt(minFollowers),
        minVideoCount: normalizePositiveInt(minVideoCount),
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("Create campaign error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 },
    );
  }
}
