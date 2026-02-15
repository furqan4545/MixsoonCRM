import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { fixThumbnailUrl } from "../../lib/thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Mail, Users, Eye, Bookmark, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default async function InfluencerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const influencer = await prisma.influencer.findUnique({
    where: { id },
    include: {
      videos: { orderBy: { uploadedAt: "desc" } },
      import: { select: { id: true, sourceFilename: true } },
    },
  });

  if (!influencer) notFound();

  const totalViews = influencer.videos.reduce((sum, v) => sum + (v.views ?? 0), 0);
  const totalBookmarks = influencer.videos.reduce((sum, v) => sum + (v.bookmarks ?? 0), 0);
  const avgViews = influencer.videos.length > 0 ? Math.round(totalViews / influencer.videos.length) : 0;
  const avgBookmarks = influencer.videos.length > 0 ? Math.round(totalBookmarks / influencer.videos.length) : 0;

  return (
    <div className="p-6">
      {/* Back button */}
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/influencers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Influencers
        </Link>
      </Button>

      {/* Profile Header */}
      <div className="mb-8 rounded-xl border bg-card p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          {influencer.avatarUrl ? (
            <img
              src={fixThumbnailUrl(influencer.avatarUrl)!}
              alt={influencer.username}
              referrerPolicy="no-referrer"
              className="h-20 w-20 rounded-full object-cover border-2 border-border"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-2xl font-bold">
              {influencer.username.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">@{influencer.username}</h1>
              {influencer.profileUrl && (
                <a
                  href={influencer.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  TikTok <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Bio */}
            {influencer.biolink && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                {influencer.biolink}
              </p>
            )}

            {/* Meta tags */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {influencer.followers != null && (
                <div className="inline-flex items-center gap-1.5 text-sm">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-semibold">{formatNumber(influencer.followers)}</span>
                  <span className="text-muted-foreground">followers</span>
                </div>
              )}
              {influencer.email && (
                <div className="inline-flex items-center gap-1.5 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{influencer.email}</span>
                </div>
              )}
              {influencer.sourceFilename && (
                <Badge variant="outline">{influencer.sourceFilename}</Badge>
              )}
              {influencer.import && (
                <Link href={`/imports/${influencer.import.id}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                    Import: {influencer.import.sourceFilename}
                  </Badge>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Videos</p>
            <p className="mt-1 text-2xl font-bold">{influencer.videos.length}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Total Views</p>
            <p className="mt-1 text-2xl font-bold">{formatNumber(totalViews)}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Avg Views</p>
            <p className="mt-1 text-2xl font-bold">{formatNumber(avgViews)}</p>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Avg Bookmarks</p>
            <p className="mt-1 text-2xl font-bold">{formatNumber(avgBookmarks)}</p>
          </div>
        </div>
      </div>

      {/* Videos Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Videos ({influencer.videos.length})
        </h2>

        {influencer.videos.length === 0 ? (
          <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            No videos scraped for this influencer.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {influencer.videos.map((video) => (
              <div
                key={video.id}
                className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                {/* Thumbnail */}
                <div className="relative aspect-9/16 overflow-hidden bg-muted">
                  {video.thumbnailUrl ? (
                    <img
                      src={fixThumbnailUrl(video.thumbnailUrl)!}
                      alt={video.title ?? "Video thumbnail"}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No thumbnail
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="p-3">
                  <p className="truncate text-sm font-medium leading-tight">
                    {video.title ?? "Untitled"}
                  </p>

                  <div className="mt-2 space-y-1.5">
                    {video.views != null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        <span>{formatNumber(video.views)} views</span>
                      </div>
                    )}
                    {video.bookmarks != null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Bookmark className="h-3 w-3" />
                        <span>{formatNumber(video.bookmarks)} saves</span>
                      </div>
                    )}
                    {video.uploadedAt && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(video.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
