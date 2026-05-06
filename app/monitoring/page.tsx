"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HealthResponse {
  ok: boolean;
  db: {
    ok: boolean;
    latencyMs: number;
    error?: string;
    host: string | null;
  };
  checkedAt: string;
}

const POLL_MS = 180_000;
const POLL_SECONDS = POLL_MS / 1000;

export default function MonitoringPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/monitoring/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as HealthResponse;
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setData(null);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // tick every second so the "X seconds ago" label stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const allHealthy = data?.ok === true;
  const dbOk = data?.db.ok === true;
  const dbLatency = data?.db.latencyMs;
  const dbHost = data?.db.host ?? "—";
  const ageSeconds = data
    ? Math.max(0, Math.floor((now - new Date(data.checkedAt).getTime()) / 1000))
    : null;

  return (
    <div className="container mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live health of the application infrastructure. Refreshes every {POLL_SECONDS} seconds.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Overall banner */}
      {!data && error ? (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5" />
              Monitoring unreachable
            </CardTitle>
            <CardDescription>
              The /api/monitoring/health endpoint failed: {error}. The Next.js
              server may be down, or the route is blocked.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : data ? (
        <Card
          className={cn(
            "border-2",
            allHealthy
              ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20"
              : "border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/20",
          )}
        >
          <CardHeader>
            <CardTitle
              className={cn(
                "flex items-center gap-2 text-lg",
                allHealthy
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-red-700 dark:text-red-300",
              )}
            >
              {allHealthy ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <AlertCircle className="h-6 w-6" />
              )}
              {allHealthy ? "All systems operational" : "Issue detected"}
            </CardTitle>
            <CardDescription>
              Last checked{" "}
              {ageSeconds !== null
                ? ageSeconds < 5
                  ? "just now"
                  : `${ageSeconds}s ago`
                : "—"}
              . Next check in {Math.max(0, POLL_SECONDS - (ageSeconds ?? 0))}s.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking…
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Component cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ComponentCard
          icon={Database}
          title="Database"
          subtitle={dbHost}
          state={!data ? "unknown" : dbOk ? "ok" : "error"}
          metric={
            dbOk && typeof dbLatency === "number"
              ? `${dbLatency} ms`
              : data?.db.error
          }
          metricLabel={dbOk ? "round-trip" : "error"}
        />
        <ComponentCard
          icon={Server}
          title="Application Server"
          subtitle="Next.js runtime"
          state={data ? "ok" : error ? "error" : "unknown"}
          metric={data ? "Reachable" : error ? "Unreachable" : "Checking…"}
          metricLabel="status"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        <Activity className="inline h-3 w-3 mr-1" />
        Database health is measured by issuing <code>SELECT 1</code> against
        Postgres. A successful round-trip confirms the VM hosting the database
        is reachable and Postgres is accepting connections.
      </p>
    </div>
  );
}

function ComponentCard({
  icon: Icon,
  title,
  subtitle,
  state,
  metric,
  metricLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  state: "ok" | "error" | "unknown";
  metric: string | undefined;
  metricLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm">{title}</CardTitle>
              <CardDescription className="text-xs font-mono mt-0.5">
                {subtitle}
              </CardDescription>
            </div>
          </div>
          <StatusBadge state={state} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">
            {metricLabel}
          </span>
          <span
            className={cn(
              "text-sm font-medium",
              state === "error" && "text-red-600 dark:text-red-400",
            )}
          >
            {metric ?? "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ state }: { state: "ok" | "error" | "unknown" }) {
  if (state === "ok") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Healthy
      </Badge>
    );
  }
  if (state === "error") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Down
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      Checking
    </Badge>
  );
}
