import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission, getCurrentUser } from "@/app/lib/rbac";

// POST /api/content-submissions/[id]/verify — PIC marks content as verified
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const user = await getCurrentUser();

    const submission = await prisma.contentSubmission.findUnique({
      where: { id },
      include: {
        influencer: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    if (submission.status === "VERIFIED" || submission.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Already verified" },
        { status: 409 },
      );
    }

    const now = new Date();
    const influencerName =
      submission.influencer.displayName || submission.influencer.username;

    await prisma.contentSubmission.update({
      where: { id },
      data: {
        status: "VERIFIED",
        verifiedAt: now,
        verifiedById: user?.id || null,
      },
    });

    // Activity log
    await prisma.activityLog.create({
      data: {
        influencerId: submission.influencerId,
        type: "content_verified",
        title: "Content verified",
        detail: `Content submission by ${influencerName} has been verified`,
      },
    });

    // Bell notification
    await prisma.notification.create({
      data: {
        type: "content_verified",
        status: "success",
        title: "Content verified",
        message: `${influencerName}'s content submission has been verified`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/content-submissions/[id]/verify]", error);
    return NextResponse.json(
      { error: "Failed to verify submission" },
      { status: 500 },
    );
  }
}
