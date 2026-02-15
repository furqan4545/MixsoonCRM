import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { fixThumbnailUrl } from "../../lib/thumbnail";
import { Badge } from "@/components/ui/badge";
import { ImportActions } from "./import-actions";

export const dynamic = "force-dynamic";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const importRecord = await prisma.import.findUnique({
    where: { id },
    include: {
      influencers: {
        include: {
          videos: { orderBy: { uploadedAt: "desc" } },
        },
        orderBy: { username: "asc" },
      },
    },
  });

  if (!importRecord) notFound();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {importRecord.sourceFilename}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <Badge
              variant={
                importRecord.status === "COMPLETED"
                  ? "default"
                  : importRecord.status === "FAILED"
                    ? "destructive"
                    : "secondary"
              }
            >
              {importRecord.status}
            </Badge>
            <span>{importRecord.rowCount} rows</span>
            <span>{importRecord.processedCount} processed</span>
            <span>
              {importRecord.influencers.length} influencers linked
            </span>
            <span>
              {new Date(importRecord.createdAt).toLocaleString()}
            </span>
          </div>
          {importRecord.errorMessage && (
            <p className="mt-2 text-sm text-destructive">
              Error: {importRecord.errorMessage}
            </p>
          )}
        </div>
        <ImportActions
          importId={importRecord.id}
          influencerCount={importRecord.influencers.length}
        />
      </div>

      {/* Influencer Cards with Thumbnail Grid */}
      {importRecord.influencers.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          No influencers linked to this import.
        </div>
      ) : (
        <div className="space-y-6">
          {importRecord.influencers.map((influencer) => (
            <div
              key={influencer.id}
              className="overflow-hidden rounded-xl border bg-card"
            >
              {/* Influencer Header */}
              <div className="flex items-center gap-4 border-b px-6 py-4">
                {influencer.avatarUrl ? (
                  <img
                    src={influencer.avatarUrl}
                    alt={influencer.username}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full object-cover border border-border"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {influencer.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/influencers/${influencer.id}`}
                      className="font-semibold hover:text-primary hover:underline"
                    >
                      @{influencer.username}
                    </Link>
                    {influencer.profileUrl && (
                      <a
                        href={influencer.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        TikTok
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {influencer.followers != null && (
                      <span>
                        {influencer.followers.toLocaleString()} followers
                      </span>
                    )}
                    {influencer.email && <span>{influencer.email}</span>}
                    {influencer.sourceFilename && (
                      <span>Source: {influencer.sourceFilename}</span>
                    )}
                  </div>
                </div>
                <Badge variant="secondary">
                  {influencer.videos.length} videos
                </Badge>
              </div>

              {/* 8-Column Thumbnail Grid */}
              {influencer.videos.length > 0 && (
                <div className="p-4">
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                    {influencer.videos.map((video) => (
                      <div
                        key={video.id}
                        className="group relative aspect-9/16 overflow-hidden rounded-lg bg-muted"
                      >
                        {video.thumbnailUrl ? (
                          <img
                            src={fixThumbnailUrl(video.thumbnailUrl)!}
                            alt={video.title ?? "Video thumbnail"}
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            No thumb
                          </div>
                        )}
                        <div className="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <p className="truncate text-[10px] font-medium text-white">
                            {video.title ?? "Untitled"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-300">
                            {video.views != null && (
                              <span>
                                {video.views.toLocaleString()} views
                              </span>
                            )}
                            {video.bookmarks != null && (
                              <span>
                                {video.bookmarks.toLocaleString()} saves
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
