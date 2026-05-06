import Link from "next/link";
import { prisma } from "./lib/prisma";
import { getCurrentUser } from "./lib/rbac";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ forbidden?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const { forbidden } = await searchParams;
  const user = await getCurrentUser();

  // PIC isolation: non-Admin only sees data for their assigned influencers
  const isAdmin = user?.role === "Admin";
  const picInfluencerFilter = !isAdmin && user?.id
    ? { pics: { some: { userId: user.id } } }
    : undefined;

  const [influencerCount, videoCount] = await Promise.all([
    prisma.influencer.count({ where: picInfluencerFilter }),
    prisma.video.count({
      where: picInfluencerFilter
        ? { influencer: picInfluencerFilter }
        : undefined,
    }),
  ]);

  return (
    <div className="p-6">
      {forbidden === "1" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          You don&apos;t have permission to access that page.
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Link
          href="/data-scraper"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Import CSV
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">
            Influencers
          </p>
          <p className="mt-1 text-3xl font-bold">{influencerCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">
            Videos Scraped
          </p>
          <p className="mt-1 text-3xl font-bold">{videoCount}</p>
        </div>
      </div>
    </div>
  );
}
