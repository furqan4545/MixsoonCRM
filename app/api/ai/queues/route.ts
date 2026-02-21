import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

// GET /api/ai/queues — Get all saved evaluations grouped by bucket
export async function GET() {
  const evaluations = await prisma.influencerAiEvaluation.findMany({
    where: { reviewStatus: "SAVED" },
    include: {
      influencer: {
        select: {
          id: true,
          username: true,
          profileUrl: true,
          avatarUrl: true,
          followers: true,
          email: true,
          biolink: true,
        },
      },
      run: {
        select: {
          id: true,
          campaign: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ bucket: "asc" }, { score: "desc" }],
  });

  return NextResponse.json(evaluations);
}
