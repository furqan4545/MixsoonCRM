"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Zap, Users, AlertTriangle, RefreshCw, Loader2,
  ShieldAlert, ShieldCheck, Settings, Ban, CheckCircle,
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

interface BudgetStatus {
  blocked: boolean;
  reason: string | null;
  currentSpendUsd: number;
  monthlyCapUsd: number;
  gcpManualCostUsd: number;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedByUserId: string | null;
  unblockedAt: string | null;
  unblockedByUserId: string | null;
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
  const { data: session } = useSession();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyUsage | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  // Admin controls state
  // editCap removed — each platform has its own budget (Apify plan, GCP quota)
  const [editGcp, setEditGcp] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const hasBillingWrite = (session?.user?.permissions ?? []).some(
    (p: { feature: string; action: string }) => p.feature === "billing" && p.action === "write",
  );

  const fetchAll = useCallback(async () => {
    try {
      const [balanceRes, usageRes, statsRes, logsRes, budgetRes] = await Promise.all([
        fetch("/api/billing/balance"),
        fetch("/api/billing/usage"),
        fetch("/api/billing/stats"),
        fetch("/api/billing/logs?limit=20"),
        fetch("/api/billing/budget"),
      ]);

      if (balanceRes.ok) setBalance(await balanceRes.json());
      if (usageRes.ok) setMonthlyUsage(await usageRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs ?? []);
      }
      if (budgetRes.ok) {
        const b = await budgetRes.json();
        setBudget(b);
        setEditGcp(b.gcpManualCostUsd > 0 ? String(b.gcpManualCostUsd) : "");
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

  const saveBudget = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/billing/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcpManualCostUsd: editGcp ? parseFloat(editGcp) : 0,
        }),
      });
      if (res.ok) {
        const b = await res.json();
        setBudget(b);
      }
    } catch (err) {
      console.error("Failed to save budget:", err);
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async () => {
    if (!budget) return;
    const newBlocked = !budget.isBlocked;
    const confirmed = newBlocked
      ? confirm("Are you sure you want to BLOCK all API requests? Scraping, AI filtering, and analytics will stop.")
      : confirm("Are you sure you want to UNBLOCK API requests? Services will resume.");
    if (!confirmed) return;

    setToggling(true);
    try {
      const res = await fetch("/api/billing/budget/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: newBlocked }),
      });
      if (res.ok) {
        const b = await res.json();
        setBudget(b);
      }
    } catch (err) {
      console.error("Failed to toggle block:", err);
    } finally {
      setToggling(false);
    }
  };

  // Real spend from actual platform APIs:
  const apifySpend = balance?.monthlyUsageUsd ?? 0;
  const apifyLimit = balance?.maxMonthlyUsageUsd ?? 0;
  const geminiSpend = stats
    ? (stats.costByService["gemini_nlp"] ?? 0) + (stats.costByService["gemini_vision"] ?? 0)
    : 0;
  const gcpQuota = budget?.gcpManualCostUsd ?? 0;

  // Each platform has its own budget — combine for overall view
  const totalSpend = apifySpend + geminiSpend;
  const totalBudget = apifyLimit + gcpQuota;
  const totalRemaining = totalBudget - totalSpend;

  const budgetPercent = totalBudget > 0
    ? Math.min(100, (totalSpend / totalBudget) * 100)
    : 0;

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
            API costs, budget management, and usage analytics
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

      {/* Budget Status Banner */}
      {budget && (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
            budget.isBlocked
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : totalBudget > 0 && budgetPercent >= 80
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {budget.isBlocked ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {budget.isBlocked
                ? "API Requests BLOCKED"
                : "API Requests Active"}
            </p>
            <p className="text-xs opacity-80">
              {budget.isBlocked
                ? budget.reason === "budget_exceeded"
                  ? `Monthly budget of $${totalBudget.toFixed(2)} exceeded. Current spend: $${totalSpend.toFixed(2)}. Admin approval required to resume.`
                  : `Manually blocked by admin${budget.blockedAt ? ` on ${new Date(budget.blockedAt).toLocaleDateString()}` : ""}. Admin approval required to resume.`
                : totalBudget > 0
                  ? `Total spend: $${totalSpend.toFixed(2)} (Apify $${apifySpend.toFixed(2)} + Gemini $${geminiSpend.toFixed(4)}) — Budget: Apify $${apifyLimit.toFixed(0)} + GCP $${gcpQuota.toFixed(0)} = $${totalBudget.toFixed(0)} (${budgetPercent.toFixed(1)}% used)`
                  : `Total spend: $${totalSpend.toFixed(2)} (Apify $${apifySpend.toFixed(2)} + Gemini $${geminiSpend.toFixed(4)})`}
            </p>
            {totalBudget > 0 && !budget.isBlocked && (
              <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className={`h-full transition-all ${
                    budgetPercent >= 95
                      ? "bg-red-500"
                      : budgetPercent >= 80
                        ? "bg-amber-500"
                        : budgetPercent >= 60
                          ? "bg-yellow-500"
                          : "bg-emerald-500"
                  }`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Apify Balance Alert */}
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
                ? "Apify credits almost exhausted!"
                : "Apify credits running low"}
            </p>
            <p className="text-xs opacity-80">
              ${balance.remainingUsd.toFixed(2)} remaining of ${balance.maxMonthlyUsageUsd.toFixed(2)} monthly limit.
            </p>
          </div>
        </div>
      )}

      {/* Admin Budget Controls */}
      {hasBillingWrite && (
        <div className="rounded-lg border p-4">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Budget Management (Admin)</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* GCP Quota */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                GCP Monthly Quota (USD)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editGcp}
                onChange={(e) => setEditGcp(e.target.value)}
                placeholder="Enter GCP budget limit"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Save Button */}
            <div className="flex items-end">
              <button
                onClick={saveBudget}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm text-background hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                Save GCP Quota
              </button>
            </div>

            {/* Block/Unblock Toggle */}
            <div className="flex items-end">
              <button
                onClick={toggleBlock}
                disabled={toggling}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  budget?.isBlocked
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {toggling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : budget?.isBlocked ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <Ban className="h-3 w-3" />
                )}
                {budget?.isBlocked ? "Resume API Services" : "Block All APIs"}
              </button>
            </div>
          </div>

          {/* Block History */}
          {budget && (budget.blockedAt || budget.unblockedAt) && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {budget.blockedAt && (
                <span>
                  Last blocked: {new Date(budget.blockedAt).toLocaleString()}{" "}
                  {budget.blockReason === "budget_exceeded" ? "(auto: budget exceeded)" : "(manual)"}
                </span>
              )}
              {budget.unblockedAt && (
                <span>Last unblocked: {new Date(budget.unblockedAt).toLocaleString()}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ORIGINAL Apify Platform Cards (from Apify API) ── */}
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

      {/* ── Platform-wise Spend Breakdown ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Apify Spend */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">Apify (Scraping Platform)</h3>
          <p className="mb-3 text-xs text-muted-foreground">From Apify dashboard — TikTok scraping, proxy, compute units</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Spent this month</p>
              <p className="text-2xl font-bold">{balance ? `$${balance.monthlyUsageUsd.toFixed(2)}` : "—"}</p>
              <p className="text-xs text-muted-foreground">{monthlyUsage ? `${monthlyUsage.dailyUsages.length} active days` : ""}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining on Apify plan</p>
              <p className={`text-2xl font-bold ${balance && balance.usagePercent >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
                {balance ? `$${balance.remainingUsd.toFixed(2)}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{balance ? `of $${balance.maxMonthlyUsageUsd.toFixed(2)} plan` : ""}</p>
            </div>
          </div>
          {balance && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  balance.usagePercent >= 95 ? "bg-red-500" : balance.usagePercent >= 80 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${balance.usagePercent}%` }}
              />
            </div>
          )}
        </div>

        {/* GCP Spend */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">GCP (Google Cloud)</h3>
          <p className="mb-3 text-xs text-muted-foreground">VM, Cloud Storage, Gemini API — quota and usage entered manually from GCP billing console</p>
          {(() => {
            const gcpQuota = budget?.gcpManualCostUsd ?? 0;
            const geminiSpend = stats
              ? (stats.costByService["gemini_nlp"] ?? 0) + (stats.costByService["gemini_vision"] ?? 0)
              : 0;
            const geminiCalls = stats
              ? (stats.callsByService["gemini_nlp"] ?? 0) + (stats.callsByService["gemini_vision"] ?? 0)
              : 0;
            const gcpUsedPercent = gcpQuota > 0 ? Math.min(100, (geminiSpend / gcpQuota) * 100) : 0;
            return (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">GCP quota (monthly)</p>
                    <p className="text-2xl font-bold">{gcpQuota > 0 ? `$${gcpQuota.toFixed(2)}` : "Not set"}</p>
                    <p className="text-xs text-muted-foreground">set by admin</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gemini AI used</p>
                    <p className="text-2xl font-bold">${geminiSpend.toFixed(4)}</p>
                    <p className="text-xs text-muted-foreground">{geminiCalls} calls tracked</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GCP remaining</p>
                    <p className={`text-2xl font-bold ${gcpQuota > 0 && gcpUsedPercent >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
                      {gcpQuota > 0 ? `$${Math.max(0, gcpQuota - geminiSpend).toFixed(2)}` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{gcpQuota > 0 ? `${(100 - gcpUsedPercent).toFixed(1)}% left` : "no quota set"}</p>
                  </div>
                </div>
                {gcpQuota > 0 && (
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        gcpUsedPercent >= 95 ? "bg-red-500" : gcpUsedPercent >= 80 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${gcpUsedPercent}%` }}
                    />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── Overall Global Budget ── */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-1 text-sm font-semibold">Overall Budget — All Platforms Combined</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Apify plan (${apifyLimit.toFixed(2)}) + GCP quota ($${gcpQuota.toFixed(2)}) = ${totalBudget.toFixed(2)} total
        </p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Total spent this month</p>
            <p className={`text-2xl font-bold ${budget?.isBlocked ? "text-red-600" : budgetPercent >= 80 ? "text-amber-600" : ""}`}>
              ${totalSpend.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">Apify ${apifySpend.toFixed(2)} + Gemini ${geminiSpend.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total budget</p>
            <p className="text-2xl font-bold">
              {totalBudget > 0 ? `$${totalBudget.toFixed(2)}` : "Not set"}
            </p>
            <p className="text-xs text-muted-foreground">Apify $${apifyLimit.toFixed(0)} + GCP $${gcpQuota.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining budget (global)</p>
            <p className={`text-2xl font-bold ${
              totalBudget > 0
                ? budgetPercent >= 95 ? "text-red-600" : budgetPercent >= 80 ? "text-amber-600" : "text-emerald-600"
                : ""
            }`}>
              {totalBudget > 0 ? `$${Math.max(0, totalRemaining).toFixed(2)}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalBudget > 0 ? `${(100 - budgetPercent).toFixed(1)}% left` : "no budget set"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">API calls this month</p>
            <p className="text-2xl font-bold">{stats ? stats.totalCalls : 0}</p>
            <p className="text-xs text-muted-foreground">{stats ? `${Object.keys(stats.callsByService).length} services` : ""}</p>
          </div>
        </div>
        {totalBudget > 0 && (
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${
                budgetPercent >= 95 ? "bg-red-500" : budgetPercent >= 80 ? "bg-amber-500" : budgetPercent >= 60 ? "bg-yellow-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, budgetPercent)}%` }}
            />
          </div>
        )}
      </div>

      {/* Cost Breakdown — how much each service cost us this month, only shows services with actual tracked spend */}
      {stats && Object.entries(stats.costByService).some(([, cost]) => cost > 0) && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">Cost Breakdown by Service</h3>
          <p className="mb-4 text-xs text-muted-foreground">Actual API costs tracked from our system — only services with real spend are shown</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(stats.costByService)
              .filter(([, cost]) => cost > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([service, cost]) => (
                <div key={service} className="rounded-md border p-3">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${SERVICE_COLORS[service] ?? "#6b7280"}20`,
                      color: SERVICE_COLORS[service] ?? "#6b7280",
                    }}
                  >
                    {SERVICE_LABELS[service] ?? service}
                  </span>
                  <p className="mt-1 text-lg font-bold">${cost.toFixed(4)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {stats.callsByService[service] ?? 0} calls
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Apify daily spend — pulled from Apify platform API, shows how much we spent on scraping each day */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">Apify Daily Spend</h3>
          <p className="mb-3 text-xs text-muted-foreground">Pulled from Apify platform — daily scraping cost (compute units, proxy, storage)</p>
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

        {/* Apify service breakdown — donut chart from Apify platform showing compute units, dataset reads, proxy, etc. */}
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">Apify Service Breakdown</h3>
          <p className="mb-3 text-xs text-muted-foreground">From Apify platform — what Apify charges for: compute, datasets, proxy, storage</p>
          {monthlyUsage && Object.keys(monthlyUsage.serviceBreakdown).length > 0 ? (
            <ServiceDonut data={monthlyUsage.serviceBreakdown} />
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
              No service breakdown available
            </div>
          )}
        </div>
      </div>

      {/* How much each CSV import cost us — each bar = one import file, shows total API cost (scraping + AI) for that batch */}
      {stats && stats.costByImport.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">API Cost per CSV Import</h3>
          <p className="mb-3 text-xs text-muted-foreground">How much each imported CSV file cost in API calls — includes scraping and AI scoring for all influencers in that import</p>
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

      {/* Our daily API cost — tracked from our system, shows combined Apify + Gemini cost each day */}
      {stats && stats.costByDay.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">Our Daily API Cost (All Services)</h3>
          <p className="mb-3 text-xs text-muted-foreground">Total API cost per day from our system logs — Apify scraping + Gemini AI calls combined</p>
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

      {/* Log of every individual API call — shows each Apify scrape, Gemini AI request with tokens, cost, and timing */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Recent API Call Log</h3>
          <p className="text-xs text-muted-foreground">Every API request we made — Apify scraping runs, Gemini AI scoring/analysis, with cost and token details</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Service</th>
                <th className="px-3 py-2 text-left font-medium">What it did</th>
                <th className="px-3 py-2 text-right font-medium">Input Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Output Tokens</th>
                <th className="px-3 py-2 text-right font-medium">Cost (USD)</th>
                <th className="px-3 py-2 text-right font-medium">Time Taken</th>
                <th className="px-3 py-2 text-center font-medium">Result</th>
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
