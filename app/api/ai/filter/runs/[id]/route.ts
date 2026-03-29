import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../../../lib/prisma";

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
    const run = await prisma.aiFilterRun.findUnique({
      where: { id },
      include: {
        campaign: true,
        import: { select: { id: true, sourceFilename: true } },
        evaluations: {
          include: {
            influencer: {
              select: {
                id: true,
                username: true,
                displayName: true,
                followers: true,
                profileUrl: true,
                avatarUrl: true,
                biolink: true,
                platform: true,
                engagementRate: true,
                language: true,
                country: true,
                pipelineStage: true,
                tags: true,
                email: true,
                bioLinkUrl: true,
                rate: true,
                notes: true,
                videos: {
                  orderBy: { uploadedAt: "desc" as const },
                  take: 8,
                },
                analytics: {
                  select: {
                    influencerGender: true,
                    influencerAgeRange: true,
                    influencerEthnicity: true,
                    influencerCountry: true,
                    lastAnalyzedAt: true,
                    mode: true,
                    confidence: true,
                  },
                },
                pics: {
                  include: { user: { select: { id: true, name: true, email: true } } },
                  orderBy: { assignedAt: "asc" as const },
                },
              },
            },
          },
          orderBy: [{ bucket: "asc" }, { score: "desc" }],
        },
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    console.error("Fetch AI run error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI run" },
      { status: 500 },
    );
  }
}
