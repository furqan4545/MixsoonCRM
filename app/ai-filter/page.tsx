"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type Run = {
  id: string;
  status: string;
  strictness: number;
  totalCount: number;
  approvedCount: number;
  okishCount: number;
  rejectedCount: number;
  reviewQueueCount: number;
  createdAt: string;
  campaign: { id: string; name: string };
};

export default function AiFilterRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/filter/runs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRuns(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight">AI Filter Runs</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        History of all AI filter runs across campaigns
      </p>

      {loading && (
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!loading && runs.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No AI filter runs yet.
        </p>
      )}

      {!loading && runs.length > 0 && (
        <div className="mt-6 space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/ai-filter/${run.id}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div>
                <p className="font-medium">{run.campaign.name}</p>
                <p className="text-xs text-muted-foreground">
                  Strictness {run.strictness} ·{" "}
                  {new Date(run.createdAt).toLocaleDateString()} at{" "}
                  {new Date(run.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    run.status === "COMPLETED"
                      ? "default"
                      : run.status === "PROCESSING"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {run.status === "COMPLETED"
                    ? "Done"
                    : run.status === "PROCESSING"
                      ? "Running"
                      : run.status}
                </Badge>
                <span className="text-xs text-emerald-700">
                  {run.approvedCount} approved
                </span>
                <span className="text-xs text-amber-700">
                  {run.okishCount} ok-ish
                </span>
                <span className="text-xs text-red-700">
                  {run.rejectedCount} rejected
                </span>
                <span className="text-xs text-muted-foreground">
                  / {run.totalCount}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
