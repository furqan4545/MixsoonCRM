import { NextRequest, NextResponse } from "next/server";
import {
  SAVE_STOPPED_BY_USER_PREFIX,
  SAVE_STOP_REQUESTED,
} from "@/app/lib/import-save";
import { requirePermission } from "@/app/lib/rbac";
import {
  cacheRemoteImageToGcs,
  deleteImportMediaExceptRunFromGcs,
  isGcsUrl,
} from "../../../../lib/gcs-media";
import { prisma } from "../../../../lib/prisma";

const SAVE_INFLUENCER_CONCURRENCY = Math.max(
  1,
  Number(process.env.SAVE_INFLUENCER_CONCURRENCY ?? 4) || 4,
);
const SAVE_MEDIA_CONCURRENCY = Math.max(
  1,
  Number(process.env.SAVE_MEDIA_CONCURRENCY ?? 8) || 8,
);
const SAVE_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.SAVE_STALE_AFTER_MS ?? 30 * 60 * 1000) ||
    30 * 60 * 1000,
);
const SAVE_STOP_CHECK_INTERVAL_MS = Math.max(
  500,
  Number(process.env.SAVE_STOP_CHECK_INTERVAL_MS ?? 1_500) || 1_500,
);

function notifyQuiet(data: Parameters<typeof prisma.notification.create>[0]["data"]) {
  return prisma.notification.create({ data }).catch((e) => {
    console.error("[save] notification error:", e);
  });
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function isStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > SAVE_STALE_AFTER_MS;
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
    const runKey = `run-${Date.now().toString(36)}`;
    let stopRequested = false;
    let lastStopCheckAt = 0;
    let failedGcsSourceCopies = 0;

    const refreshStopRequested = async (force = false) => {
      if (stopRequested) return true;
      const now = Date.now();
      if (!force && now - lastStopCheckAt < SAVE_STOP_CHECK_INTERVAL_MS) {
        return false;
      }
      lastStopCheckAt = now;
      const state = await prisma.import.findUnique({
        where: { id },
        select: { status: true, errorMessage: true },
      });
      if (!state || state.status !== "PROCESSING") {
        stopRequested = true;
        return true;
      }
      if (state.errorMessage === SAVE_STOP_REQUESTED) {
        stopRequested = true;
        return true;
      }
      return false;
    };

    await notifyQuiet({
      type: "import_save",
      status: "info",
      title: `Saving to cloud — ${importRecord.sourceFilename}`,
      message: `Caching images for ${total} influencer${total === 1 ? "" : "s"}…`,
      importId: id,
    });

    await runWithConcurrency(
      importRecord.influencers,
      SAVE_INFLUENCER_CONCURRENCY,
      async (influencer) => {
        if (await refreshStopRequested()) return;
        let avatarCached = false;
        let thumbnailsCached = 0;
        let influencerError: string | null = null;

        const videosToCache = influencer.videos.filter((v) => Boolean(v.thumbnailUrl));
        const targetAssets =
          (influencer.avatarUrl ? 1 : 0) +
          videosToCache.length;

        try {
          if (influencer.avatarUrl) {
            try {
              const gcsAvatar = await cacheRemoteImageToGcs({
                sourceUrl: influencer.avatarUrl,
                importId: id,
                kind: "avatars",
                username: influencer.username,
                runKey,
              });
              if (gcsAvatar) {
                await prisma.influencer.update({
                  where: { id: influencer.id },
                  data: { avatarUrl: gcsAvatar },
                });
                avatarCached = true;
              } else if (isGcsUrl(influencer.avatarUrl)) {
                failedGcsSourceCopies += 1;
              }
            } catch (err) {
              console.error(`Avatar GCS error for ${influencer.username}:`, err);
              if (isGcsUrl(influencer.avatarUrl)) {
                failedGcsSourceCopies += 1;
              }
            }
          }

          await runWithConcurrency(videosToCache, SAVE_MEDIA_CONCURRENCY, async (video) => {
            if (await refreshStopRequested()) return;
            const sourceUrl = video.thumbnailUrl;
            if (!sourceUrl) return;
            try {
              const gcsThumb = await cacheRemoteImageToGcs({
                sourceUrl,
                importId: id,
                kind: "thumbnails",
                username: influencer.username,
                runKey,
              });
              if (gcsThumb) {
                await prisma.video.update({
                  where: { id: video.id },
                  data: { thumbnailUrl: gcsThumb },
                });
                thumbnailsCached += 1;
              } else if (isGcsUrl(sourceUrl)) {
                failedGcsSourceCopies += 1;
              }
            } catch (err) {
              console.error(`Thumbnail GCS error for ${video.id}:`, err);
              if (isGcsUrl(sourceUrl)) {
                failedGcsSourceCopies += 1;
              }
            }
          });
        } catch (err) {
          influencerError = err instanceof Error ? err.message : "Unknown save error";
        }

        const progressRow = await prisma.import.update({
          where: { id },
          data: { saveProgress: { increment: 1 } },
          select: { saveProgress: true },
        });
        const tag = `[${progressRow.saveProgress}/${total}]`;
        const cachedAssets = (avatarCached ? 1 : 0) + thumbnailsCached;

        await notifyQuiet({
          type: "import_save",
          status: influencerError ? "error" : "success",
          title: `${tag} @${influencer.username} cached`,
          message: influencerError
            ? `Failed to fully cache media for @${influencer.username}: ${influencerError}`
            : `${cachedAssets}/${targetAssets} media asset${targetAssets === 1 ? "" : "s"} uploaded to cloud.`,
          importId: id,
        });
      },
    );

    if (await refreshStopRequested(true)) {
      const stopped = await prisma.import.update({
        where: { id },
        data: {
          status: "DRAFT",
          errorMessage: `${SAVE_STOPPED_BY_USER_PREFIX} at current progress.`,
        },
        select: { saveProgress: true, saveTotal: true },
      });
      await prisma.import.update({
        where: { id },
        data: {
          errorMessage: `${SAVE_STOPPED_BY_USER_PREFIX} at ${stopped.saveProgress}/${stopped.saveTotal}.`,
        },
      });
      await notifyQuiet({
        type: "import_save",
        status: "info",
        title: "Save to cloud stopped",
        message: `Stopped at ${stopped.saveProgress}/${stopped.saveTotal}. You can restart save anytime.`,
        importId: id,
      });
      return;
    }

    if (failedGcsSourceCopies === 0) {
      try {
        await deleteImportMediaExceptRunFromGcs(id, runKey);
      } catch (cleanupErr) {
        console.error(`[save] cleanup for ${id} failed:`, cleanupErr);
      }
    } else {
      await notifyQuiet({
        type: "import_save",
        status: "info",
        title: "Save cleanup skipped",
        message:
          "Some existing cloud files could not be copied, so old files were kept to avoid broken images.",
        importId: id,
      });
    }

    await prisma.import.update({
      where: { id },
      data: { status: "COMPLETED", errorMessage: null },
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
  try {
    await requirePermission("imports", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const importRecord = await prisma.import.findUnique({
    where: { id },
    select: {
      status: true,
      updatedAt: true,
      influencers: { select: { id: true } },
    },
  });

  if (!importRecord) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  let effectiveStatus = importRecord.status;
  if (effectiveStatus === "PROCESSING" && isStale(importRecord.updatedAt)) {
    await prisma.import.update({
      where: { id },
      data: {
        status: "DRAFT",
        errorMessage: "Previous save job became stale. Please retry.",
      },
    });
    effectiveStatus = "DRAFT";
  }

  if (
    effectiveStatus !== "DRAFT" &&
    effectiveStatus !== "COMPLETED" &&
    effectiveStatus !== "FAILED"
  ) {
    return NextResponse.json(
      { error: `Import is already ${effectiveStatus}` },
      { status: 400 },
    );
  }

  const total = importRecord.influencers.length;

  await prisma.import.update({
    where: { id },
    data: {
      status: "PROCESSING",
      saveProgress: 0,
      saveTotal: total,
      errorMessage: null,
    },
  });

  processGcsSave(id).catch((err) =>
    console.error("[save] Unhandled:", err),
  );

  return NextResponse.json({ started: true, total }, { status: 202 });
}
