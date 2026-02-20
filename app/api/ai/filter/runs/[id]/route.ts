import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
                followers: true,
                profileUrl: true,
                avatarUrl: true,
                biolink: true,
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
