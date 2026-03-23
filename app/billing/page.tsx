"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Zap, Users, AlertTriangle, RefreshCw, Loader2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface Balance {
  monthlyUsageUsd: number;
  maxMonthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStart: string;
  cycleEnd: string;
}

interface MonthlyUsage {
  startAt: string;
  endAt: string;
  totalUsageCreditsUsd: number;
  dailyUsages: { date: string; totalUsageCreditsUsd: number }[];
  serviceBreakdown: Record<string, number>;
}

interface UsageStats {
  totalCostUsd: number;
  totalCalls: number;
  avgCostPerInfluencer: number;
  costByService: Record<string, number>;
  callsByService: Record<string, number>;
  costByDay: { date: string; cost: number }[];
  costByImport: { importId: string; filename: string; cost: number; callCount: number }[];
}

interface LogEntry {
  id: string;
  service: string;
  action: string;
  importId: string | null;
  influencerId: string | null;
  costUsd: number;
  inputCount: number;
  outputCount: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

// ─── Constants ──────────────────────────────────────────────

const SERVICE_COLORS: Record<string, string> = {
  apify_video: "#3b82f6",
  apify_profile: "#8b5cf6",
  apify_comments: "#10b981",
  gemini_nlp: "#f59e0b",
  gemini_vision: "#ef4444",
  ACTOR_COMPUTE_UNITS: "#3b82f6",
  DATASET_READS: "#10b981",
  DATASET_WRITES: "#f59e0b",
  KEY_VALUE_STORE_READS: "#8b5cf6",
  KEY_VALUE_STORE_WRITES: "#ef4444",
  PROXY_SERPS: "#ec4899",
};

const SERVICE_LABELS: Record<string, string> = {
  apify_video: "Apify Video Scraper",
  apify_profile: "Apify Profile Scraper",
  apify_comments: "Apify Comments",
  gemini_nlp: "Gemini NLP",
  gemini_vision: "Gemini Vision",
  ACTOR_COMPUTE_UNITS: "Compute Units",
  DATASET_READS: "Dataset Reads",
  DATASET_WRITES: "Dataset Writes",
  KEY_VALUE_STORE_READS: "KV Store Reads",
  KEY_VALUE_STORE_WRITES: "KV Store Writes",
  PROXY_SERPS: "Proxy SERPs",
};

// ─── Component ──────────────────────────────────────────────

export default function BillingPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const [balanceRes, usageRes, statsRes, logsRes] = await Promise.all([
        fetch("/api/billing/balance"),
        fetch("/api/billing/usage"),
        fetch("/api/billing/stats"),
        fetch("/api/billing/logs?limit=20"),
      ]);

      if (balanceRes.ok) setBalance(await balanceRes.json());
      if (usageRes.ok) setMonthlyUsage(await usageRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch billing data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchAll();
    }
  }, [fetchAll]);

  const refresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing & Usage</h1>
          <p className="text-sm text-muted-foreground">
            API costs, credits remaining, and usage analytics
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Balance Alert */}
      {balance && balance.usagePercent >= 80 && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            balance.usagePercent >= 95
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          }`}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">
              {balance.usagePercent >= 95
                ? "Credits almost exhausted!"
                : "Credits running low"}
            </p>
            <p className="text-xs opacity-80">
              ${balance.remainingUsd.toFixed(2)} remaining of ${balance.maxMonthlyUsageUsd.toFixed(2)} monthly limit.
              {balance.usagePercent >= 95
                ? " Top up at apify.com/billing to continue scraping."
                : ""}
            </p>
          </div>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Credits Remaining"
          value={balance ? `$${balance.remainingUsd.toFixed(2)}` : "—"}
          sub={balance ? `of $${balance.maxMonthlyUsageUsd.toFixed(2)}` : ""}
          color={
            balance
              ? balance.usagePercent >= 95
                ? "text-red-600"
                : balance.usagePercent >= 80
                  ? "text-amber-600"
                  : "text-emerald-600"
              : ""
          }
          progress={balance ? 100 - balance.usagePercent : 0}
          progressColor={
            balance
              ? balance.usagePercent >= 95
                ? "bg-red-500"
                : balance.usagePercent >= 80
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              : "bg-muted"
          }
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="This Month"
          value={balance ? `$${balance.monthlyUsageUsd.toFixed(2)}` : "—"}
          sub={monthlyUsage ? `${monthlyUsage.dailyUsages.length} active days` : ""}
        />
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="API Calls"
          value={stats ? String(stats.totalCalls) : "0"}
          sub={stats ? `${Object.keys(stats.callsByService).length} services` : ""}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Avg / Influencer"
          value={stats ? `$${stats.avgCostPerInfluencer.toFixed(4)}` : "$0"}
          sub="tracked locally"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily Spending (Apify) */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-semibold">Daily Spending (Apify)</h3>
          {monthlyUsage && monthlyUsage.dailyUsages.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart
                data={monthlyUsage.dailyUsages.map((d) => ({
                  date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  cost: Math.round(d.totalUsageCreditsUsd * 10000) / 10000,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, "Cost"]} />
                <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No usage data available
            </div>
          )}
        </div>

        {/* Cost by Service (Apify breakdown) */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-semibold">Cost by Service (Apify)</h3>
          {monthlyUsage && Object.keys(monthlyUsage.serviceBreakdown).length > 0 ? (
            <ServiceDonut data={monthlyUsage.serviceBreakdown} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No service breakdown available
            </div>
          )}
        </div>
      </div>

      {/* Cost per Import */}
      {stats && stats.costByImport.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-semibold">Cost per Import (Local Tracking)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.costByImport}>
              <XAxis dataKey="filename" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, "Cost"]}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Local Usage by Day */}
      {stats && stats.costByDay.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-semibold">Local API Cost by Day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.costByDay}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, "Cost"]} />
              <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent API Calls Table */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Recent API Calls</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Service</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-right font-medium">In</th>
                <th className="px-3 py-2 text-right font-medium">Out</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Duration</th>
                <th className="px-3 py-2 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No API calls logged yet. Scrape some influencers to see usage data.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${SERVICE_COLORS[log.service] ?? "#6b7280"}20`,
                          color: SERVICE_COLORS[log.service] ?? "#6b7280",
                        }}
                      >
                        {SERVICE_LABELS[log.service] ?? log.service}
                      </span>
                    </td>
                    <td className="px-3 py-2">{log.action}</td>
                    <td className="px-3 py-2 text-right">{log.inputCount || log.inputTokens || "—"}</td>
                    <td className="px-3 py-2 text-right">{log.outputCount || log.outputTokens || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {log.costUsd > 0 ? `$${log.costUsd.toFixed(4)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {log.durationMs > 0 ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          log.status === "success"
                            ? "bg-emerald-500"
                            : log.status === "failed"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        }`}
                        title={log.status}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color, progress, progressColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold ${color ?? ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {progress !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${progressColor ?? "bg-foreground"}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Service Donut (grouped, top 5 + Other) ─────────────────

const TOP_N = 5;
const DONUT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#9ca3af"];

function prettifyServiceName(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Gbytes", "GB")
    .replace("Gbyte Hours", "GB·h")
    .replace("Usd", "USD");
}

function ServiceDonut({ data }: { data: Record<string, number> }) {
  const sorted = Object.entries(data)
    .filter(([, v]) => v > 0.0001)
    .sort(([, a], [, b]) => b - a);

  const top = sorted.slice(0, TOP_N);
  const otherTotal = sorted.slice(TOP_N).reduce((sum, [, v]) => sum + v, 0);

  const chartData = top.map(([name, value]) => ({
    name: SERVICE_LABELS[name] ?? prettifyServiceName(name),
    value: Math.round(value * 100) / 100,
  }));

  if (otherTotal > 0.0001) {
    chartData.push({ name: "Other", value: Math.round(otherTotal * 100) / 100 });
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          dataKey="value"
          paddingAngle={2}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: unknown) => `$${Number(v).toFixed(2)}`} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
