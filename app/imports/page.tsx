import Link from "next/link";
import { prisma } from "../lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const imports = await prisma.import.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { influencers: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
          <p className="text-sm text-muted-foreground">
            Manage your CSV imports and their linked influencer data.
          </p>
        </div>
        <Button asChild>
          <Link href="/data-scraper">New Import</Link>
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-muted-foreground">No imports yet.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/data-scraper">Upload your first CSV</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Processed</TableHead>
                <TableHead className="text-right">Influencers</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => (
                <TableRow key={imp.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/imports/${imp.id}`}
                      className="hover:underline"
                    >
                      {imp.sourceFilename}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        imp.status === "COMPLETED"
                          ? "default"
                          : imp.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {imp.status === "DRAFT"
                        ? "Scraping done"
                        : imp.status === "PROCESSING"
                          ? "Saving to cloud…"
                          : imp.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{imp.rowCount}</TableCell>
                  <TableCell className="text-right">
                    {imp.processedCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {imp._count.influencers}
                  </TableCell>
                  <TableCell>
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/imports/${imp.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
