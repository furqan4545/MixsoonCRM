import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSignedUrl } from "@/app/lib/gcs-upload";

// GET /api/content-submissions/[id]/video-url?index=0
// Returns a short-lived signed URL for the uploaded video at the given index.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("influencers", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const indexStr = request.nextUrl.searchParams.get("index") ?? "0";
  const index = Number.parseInt(indexStr, 10);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }

  const submission = await prisma.contentSubmission.findUnique({
    where: { id },
    select: { videoFiles: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const files = (submission.videoFiles as Array<{ gcsPath: string; type?: string; name?: string }>) ?? [];
  const file = files[index];
  if (!file?.gcsPath) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const url = await getSignedUrl(file.gcsPath, 60 * 60 * 1000); // 1h
  if (!url) {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url,
    name: file.name ?? null,
    type: file.type ?? "video/mp4",
  });
}
