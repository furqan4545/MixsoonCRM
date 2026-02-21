import Link from "next/link";
import { prisma } from "./lib/prisma";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ forbidden?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const { forbidden } = await searchParams;
  const [importCount, influencerCount, videoCount, recentImports] =
    await Promise.all([
      prisma.import.count(),
      prisma.influencer.count(),
      prisma.video.count(),
      prisma.import.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { influencers: true } } },
      }),
    ]);

  return (
    <div className="p-6">
      {forbidden === "1" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          You don&apos;t have permission to access that page.
        </div>
      )}
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">
            Total Imports
          </p>
          <p className="mt-1 text-3xl font-bold">{importCount}</p>
        </div>
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

      {/* Recent Imports */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Recent Imports</h2>
          <Link
            href="/imports"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
        {recentImports.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No imports yet.{" "}
            <Link
              href="/data-scraper"
              className="text-primary underline hover:no-underline"
            >
              Upload a CSV
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <div className="divide-y">
            {recentImports.map((imp) => (
              <Link
                key={imp.id}
                href={`/imports/${imp.id}`}
                className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{imp.sourceFilename}</p>
                  <p className="text-xs text-muted-foreground">
                    {imp._count.influencers} influencers &middot;{" "}
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={
                    imp.status === "COMPLETED"
                      ? "default"
                      : imp.status === "FAILED"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {imp.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
