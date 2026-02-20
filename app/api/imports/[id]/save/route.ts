import { NextRequest, NextResponse } from "next/server";
import { cacheRemoteImageToGcs, isGcsUrl } from "../../../../lib/gcs-media";
import { prisma } from "../../../../lib/prisma";

// POST /api/imports/:id/save — Persist a DRAFT import: cache images to GCS and mark COMPLETED
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const importRecord = await prisma.import.findUnique({
    where: { id },
    include: {
      influencers: {
        include: { videos: true },
      },
    },
  });

  if (!importRecord) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  if (importRecord.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Import is already ${importRecord.status}` },
      { status: 400 },
    );
  }

  await prisma.import.update({
    where: { id },
    data: { status: "PROCESSING" },
  });

  try {
    for (const influencer of importRecord.influencers) {
      if (influencer.avatarUrl && !isGcsUrl(influencer.avatarUrl)) {
        try {
          const gcsAvatar = await cacheRemoteImageToGcs({
            sourceUrl: influencer.avatarUrl,
            importId: id,
            kind: "avatars",
            username: influencer.username,
          });
          if (gcsAvatar) {
            await prisma.influencer.update({
              where: { id: influencer.id },
              data: { avatarUrl: gcsAvatar },
            });
          }
        } catch (err) {
          console.error(`Avatar GCS cache error for ${influencer.username}:`, err);
        }
      }

      for (const video of influencer.videos) {
        if (video.thumbnailUrl && !isGcsUrl(video.thumbnailUrl)) {
          try {
            const gcsThumb = await cacheRemoteImageToGcs({
              sourceUrl: video.thumbnailUrl,
              importId: id,
              kind: "thumbnails",
              username: influencer.username,
            });
            if (gcsThumb) {
              await prisma.video.update({
                where: { id: video.id },
                data: { thumbnailUrl: gcsThumb },
              });
            }
          } catch (err) {
            console.error(`Thumbnail GCS cache error for ${video.id}:`, err);
          }
        }
      }
    }

    await prisma.import.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({ success: true, status: "COMPLETED" });
  } catch (error) {
    console.error("Save import error:", error);
    await prisma.import.update({
      where: { id },
      data: { status: "DRAFT" },
    });
    return NextResponse.json(
      { error: "Failed to save import" },
      { status: 500 },
    );
  }
}
