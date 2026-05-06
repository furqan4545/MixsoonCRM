import Link from "next/link";
import { ChevronRight, FileSpreadsheet } from "lucide-react";
import { prisma } from "./lib/prisma";
import { getCurrentUser } from "./lib/rbac";
import { isAdminIsolationEnabled } from "./lib/ownership";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ forbidden?: string }> };

const statusBadge: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-gray-100 text-gray-700 border-gray-200" },
  PROCESSING: { label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
  DRAFT: { label: "Draft", className: "bg-amber-50 text-amber-700 border-amber-200" },
  COMPLETED: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  FAILED: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
};

export default async function DashboardPage({ searchParams }: Props) {
  const { forbidden } = await searchParams;
  const user = await getCurrentUser();

  const isAdmin = user?.role === "Admin";
  const adminIsolated = await isAdminIsolationEnabled();
  const restrict = (!isAdmin || adminIsolated) && !!user?.id;

  // Per-user isolation — non-admins (or admins with isolation enabled) see
  // their own + shared resources. Admins by default see everything.
  let influencerWhere: Record<string, unknown> | undefined;
  let importWhere: Record<string, unknown> | undefined;
  let videoWhere: Record<string, unknown> | undefined;
  if (restrict && user?.id) {
    const [influencerShares, importShares] = await Promise.all([
      prisma.resourceShare.findMany({
        where: { userId: user.id, resourceType: "Influencer" },
        select: { resourceId: true },
      }),
      prisma.resourceShare.findMany({
        where: { userId: user.id, resourceType: "Import" },
        select: { resourceId: true },
      }),
    ]);
    const sharedInfluencerIds = influencerShares.map((s) => s.resourceId);
    const sharedImportIds = importShares.map((s) => s.resourceId);

    influencerWhere = {
      OR: [
        { createdById: user.id },
        { pics: { some: { userId: user.id } } },
        ...(sharedInfluencerIds.length > 0
          ? [{ id: { in: sharedInfluencerIds } }]
          : []),
      ],
    };
    importWhere = {
      OR: [
        { createdById: user.id },
        { influencers: { some: { pics: { some: { userId: user.id } } } } },
        ...(sharedImportIds.length > 0
          ? [{ id: { in: sharedImportIds } }]
          : []),
      ],
    };
    videoWhere = { influencer: influencerWhere };
  }

  const [influencerCount, videoCount, imports] = await Promise.all([
    prisma.influencer.count({ where: influencerWhere }),
    prisma.video.count({ where: videoWhere }),
    prisma.import.findMany({
      where: importWhere,
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
          <p className="text-sm font-medium text-muted-foreground">Influencers</p>
          <p className="mt-1 text-3xl font-bold">{influencerCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm font-medium text-muted-foreground">Videos Scraped</p>
          <p className="mt-1 text-3xl font-bold">{videoCount}</p>
        </div>
      </div>

      {/* CSV imports table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold">CSV Imports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any row to view the influencers it created.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {imports.length} import{imports.length !== 1 ? "s" : ""}
          </span>
        </div>
        {imports.length === 0 ? (
          <div className="p-12 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No imports yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              <Link href="/data-scraper" className="text-primary underline hover:no-underline">
                Upload a CSV
              </Link>{" "}
              to get started.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 border-b bg-muted/30 px-6 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div>File</div>
              <div>Status</div>
              <div className="text-right">Influencers</div>
              <div>Date</div>
              <div className="w-4" />
            </div>
            <div className="divide-y">
              {imports.map((imp) => {
                const badge = statusBadge[imp.status] ?? statusBadge.PENDING;
                return (
                  <Link
                    key={imp.id}
                    href={`/influencers?importId=${imp.id}&csv=${encodeURIComponent(imp.sourceFilename)}`}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/40 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">
                        {imp.sourceFilename}
                      </span>
                    </div>
                    <div>
                      <Badge
                        className={`${badge.className} border font-normal`}
                        variant="outline"
                      >
                        {badge.label}
                      </Badge>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      {imp._count.influencers}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(imp.createdAt).toLocaleDateString()}
                    </div>
                    <div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
