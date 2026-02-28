import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { AiBucket } from "@prisma/client";

const VALID_BUCKETS = Object.values(AiBucket);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { evalIds, targetBucket } = body as {
      evalIds: string[];
      targetBucket: string;
    };

    if (!Array.isArray(evalIds) || evalIds.length === 0) {
      return NextResponse.json(
        { error: "evalIds must be a non-empty array" },
        { status: 400 },
      );
    }

    if (!VALID_BUCKETS.includes(targetBucket as AiBucket)) {
      return NextResponse.json(
        { error: "Invalid target bucket" },
        { status: 400 },
      );
    }

    // Update all evaluations to the new bucket
    const result = await prisma.influencerAiEvaluation.updateMany({
      where: {
        id: { in: evalIds },
        reviewStatus: "SAVED",
      },
      data: {
        bucket: targetBucket as AiBucket,
      },
    });

    return NextResponse.json({
      updated: result.count,
      targetBucket,
    });
  } catch (error) {
    console.error("Failed to move queue:", error);
    return NextResponse.json(
      { error: "Failed to move between queues" },
      { status: 500 },
    );
  }
}
