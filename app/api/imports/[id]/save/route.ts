import { NextRequest, NextResponse } from "next/server";
import { cacheRemoteImageToGcs, isGcsUrl } from "../../../../lib/gcs-media";
import { prisma } from "../../../../lib/prisma";

function notifyQuiet(data: Parameters<typeof prisma.notification.create>[0]["data"]) {
  return prisma.notification.create({ data }).catch((e) => {
    console.error("[save] notification error:", e);
  });
}

async function processGcsSave(id: string) {
  try {
    const importRecord = await prisma.import.findUnique({
      where: { id },
      include: {
        influencers: {
          include: { videos: true },
        },
      },
    });

    if (!importRecord) return;

    const total = importRecord.influencers.length;

    await notifyQuiet({
      type: "import_save",
      status: "info",
      title: `Saving to cloud — ${importRecord.sourceFilename}`,
      message: `Caching images for ${total} influencer${total === 1 ? "" : "s"}…`,
      importId: id,
    });

    let stepIndex = 0;

    for (const influencer of importRecord.influencers) {
      stepIndex += 1;
      const tag = `[${stepIndex}/${total}]`;

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
          console.error(`Avatar GCS error for ${influencer.username}:`, err);
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
            console.error(`Thumbnail GCS error for ${video.id}:`, err);
          }
        }
      }

      await prisma.import.update({
        where: { id },
        data: { saveProgress: { increment: 1 } },
      });

      const thumbCount = influencer.videos.filter((v) => v.thumbnailUrl && !isGcsUrl(v.thumbnailUrl)).length;
      await notifyQuiet({
        type: "import_save",
        status: "success",
        title: `${tag} @${influencer.username} cached`,
        message: `Avatar + ${thumbCount} thumbnail${thumbCount === 1 ? "" : "s"} uploaded to cloud.`,
        importId: id,
      });
    }

    await prisma.import.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    await notifyQuiet({
      type: "import_save",
      status: "success",
      title: `Save complete — ${importRecord.sourceFilename}`,
      message: `All images for ${total} influencer${total === 1 ? "" : "s"} cached to cloud.`,
      importId: id,
    });

    console.log(`[save] Import ${id} completed`);
  } catch (error) {
    console.error(`[save] Import ${id} failed:`, error);
    const errMsg = error instanceof Error ? error.message : "Save failed";
    await prisma.import
      .update({
        where: { id },
        data: {
          status: "DRAFT",
          saveProgress: 0,
          saveTotal: 0,
          errorMessage: errMsg,
        },
      })
      .catch(() => {});

    await notifyQuiet({
      type: "import_save",
      status: "error",
      title: "Save to cloud failed",
      message: errMsg,
      importId: id,
    });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const importRecord = await prisma.import.findUnique({
    where: { id },
    include: { influencers: { select: { id: true } } },
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

  const total = importRecord.influencers.length;

  await prisma.import.update({
    where: { id },
    data: { status: "PROCESSING", saveProgress: 0, saveTotal: total },
  });

  processGcsSave(id).catch((err) =>
    console.error("[save] Unhandled:", err),
  );

  return NextResponse.json({ started: true, total }, { status: 202 });
}
