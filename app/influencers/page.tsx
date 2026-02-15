import Link from "next/link";
import { prisma } from "../lib/prisma";
import { fixThumbnailUrl } from "../lib/thumbnail";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function formatNumber(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default async function InfluencersPage() {
  const influencers = await prisma.influencer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { videos: true } },
      import: { select: { id: true, sourceFilename: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Influencers</h1>
        <p className="text-sm text-muted-foreground">
          All scraped influencer profiles. Click on any influencer to see their videos.
        </p>
      </div>

      {influencers.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-muted-foreground">No influencers yet.</p>
          <Link
            href="/data-scraper"
            className="mt-2 inline-block text-sm text-primary underline hover:no-underline"
          >
            Upload a CSV to get started
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {influencers.map((inf) => (
            <Link
              key={inf.id}
              href={`/influencers/${inf.id}`}
              className="group rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/20"
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                {inf.avatarUrl ? (
                  <img
                    src={fixThumbnailUrl(inf.avatarUrl)!}
                    alt={inf.username}
                    referrerPolicy="no-referrer"
                    className="h-12 w-12 rounded-full object-cover border border-border"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {inf.username.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold group-hover:text-primary transition-colors">
                    @{inf.username}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {inf.followers != null && (
                      <span>{formatNumber(inf.followers)} followers</span>
                    )}
                    {inf._count.videos > 0 && (
                      <span>&middot; {inf._count.videos} videos</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="mt-3 space-y-1.5">
                {inf.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {inf.email}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {inf.sourceFilename && (
                    <Badge variant="outline" className="text-[10px]">
                      {inf.sourceFilename}
                    </Badge>
                  )}
                  {inf.import ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Linked
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] opacity-50">
                      Unlinked
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
