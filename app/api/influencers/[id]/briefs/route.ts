import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

// GET /api/influencers/[id]/briefs
//   Returns all content briefs sent to this influencer, newest first.
//   Strips the raw token from the response (so it's never exposed in the
//   authenticated dashboard — only the influencer's email holds it).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requirePermission("influencers", "read");
  const { id } = await params;

  const briefs = await prisma.contentBrief.findMany({
    where: { influencerId: id },
    orderBy: { sentAt: "desc" },
    include: {
      marketingCampaign: { select: { id: true, name: true } },
      sentByUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    briefs: briefs.map((b) => ({
      id: b.id,
      campaign: b.marketingCampaign,
      bodySnapshot: b.bodySnapshot,
      howToPostSnapshot: b.howToPostSnapshot,
      hashtagsSnapshot: b.hashtagsSnapshot,
      uploadDate: b.uploadDate?.toISOString() ?? null,
      notes: b.notes,
      sentBy: b.sentByUser,
      sentAt: b.sentAt.toISOString(),
    })),
  });
}
