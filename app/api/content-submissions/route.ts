import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { ownershipWhere } from "@/app/lib/ownership";

// GET /api/content-submissions?influencerId=xxx
export async function GET(request: Request) {
  let currentUser;
  try {
    currentUser = await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const influencerId = searchParams.get("influencerId");

    const ownership = await ownershipWhere("ContentSubmission", currentUser);
    const where: Record<string, unknown> = {};
    if (influencerId) where.influencerId = influencerId;
    if (ownership) Object.assign(where, ownership);

    const submissions = await prisma.contentSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    const serialized = submissions.map((s) => ({
      id: s.id,
      influencerId: s.influencerId,
      influencer: s.influencer,
      videoLinks: s.videoLinks,
      videoFiles: (s.videoFiles as Array<{ gcsPath: string; name: string; size: number; type: string }>) ?? [],
      notes: s.notes,
      sCode: s.sCode,
      submissionLabel: s.submissionLabel,
      includePayment: s.includePayment,
      bankName: s.bankName,
      accountHolder: s.accountHolder,
      status: s.status,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      verifiedAt: s.verifiedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json({ submissions: serialized });
  } catch (error) {
    console.error("[GET /api/content-submissions]", error);
    return NextResponse.json(
      { error: "Failed to fetch submissions" },
      { status: 500 },
    );
  }
}
