"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { BarChart3, Loader2, Settings2, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────

interface AnalyticsData {
  influencerGender: string | null;
  influencerAgeRange: string | null;
  influencerEthnicity: string | null;
  genderBreakdown: { male: number; female: number; unknown: number };
  ageBrackets: Record<string, number>;
  topCountries: { country: string; countryName: string; percentage: number }[];
  ethnicityBreakdown: Record<string, number> | null;
  topInterests: { category: string; score: number }[];
  audienceQuality: number | null;
  mode: string;
  confidence: number;
  commentCount: number;
  avatarsSampled: number;
  lastAnalyzedAt: string;
}

interface RunStatus {
  id: string;
  status: string;
  mode: string;
  progress: number;
  progressMsg: string | null;
  commentCount: number;
  avatarCount: number;
  errorMessage: string | null;
  createdAt: string;
}

interface VideoData {
  views: number | null;
  bookmarks: number | null;
  uploadedAt: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

type AnalysisMode = "NLP_ONLY" | "HYBRID" | "FULL_VISION";

interface AnalyticsTabProps {
  influencerId: string;
  username: string;
  avatarUrl: string | null;
  videos: VideoData[];
}

// ─── Constants ──────────────────────────────────────────────

const GENDER_COLORS = ["#3b82f6", "#ec4899", "#9ca3af"]; // blue, pink, gray
const AGE_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444"];
const ETHNICITY_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

const MODE_LABELS: Record<AnalysisMode, string> = {
  NLP_ONLY: "NLP Only",
  HYBRID: "Hybrid",
  FULL_VISION: "Full Vision",
};

const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  NLP_ONLY: "Comment text analysis only — fastest, cheapest",
  HYBRID: "NLP + face analysis on influencer + ~100 commenter avatars",
  FULL_VISION: "NLP + face analysis on influencer + ~300 commenter avatars",
};

// ─── Component ──────────────────────────────────────────────

export default function AnalyticsTab({
  influencerId,
  username,
  avatarUrl,
  videos,
}: AnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [latestRun, setLatestRun] = useState<RunStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [selectedMode, setSelectedMode] = useState<AnalysisMode>("HYBRID");
  const [showConfig, setShowConfig] = useState(false);

  const fetchedRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Fetch existing analytics ──
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/${influencerId}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const data = await res.json();
      setAnalytics(data.analytics);
      setLatestRun(data.latestRun);

      // If there's an active run, connect to SSE
      if (
        data.latestRun &&
        !["COMPLETED", "FAILED"].includes(data.latestRun.status)
      ) {
        setAnalyzing(true);
        connectSSE();
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [influencerId]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchAnalytics();
    }
    return () => {
      eventSourceRef.current?.close();
    };
  }, [fetchAnalytics]);

  // ── SSE connection ──
  const connectSSE = useCallback(() => {
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/analytics/${influencerId}/status`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data.progress ?? 0);
        setProgressMsg(data.message ?? "");

        if (data.status === "COMPLETED") {
          setAnalyzing(false);
          es.close();
          eventSourceRef.current = null;
          fetchAnalytics();
          toast.success("Audience analysis completed!");
        } else if (data.status === "FAILED") {
          setAnalyzing(false);
          es.close();
          eventSourceRef.current = null;
          toast.error(data.errorMessage ?? "Analysis failed");
          fetchAnalytics();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setAnalyzing(false);
    };
  }, [influencerId, fetchAnalytics]);

  // ── Start analysis ──
  const startAnalysis = async () => {
    try {
      setAnalyzing(true);
      setProgress(0);
      setProgressMsg("Starting analysis...");

      const res = await fetch("/api/analytics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId, mode: selectedMode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to start analysis");
      }

      connectSSE();
    } catch (err) {
      setAnalyzing(false);
      toast.error(
        err instanceof Error ? err.message : "Failed to start analysis",
      );
    }
  };

  // ── Engagement trend data from videos ──
  const engagementData = videos
    .filter((v) => v.uploadedAt)
    .sort(
      (a, b) =>
        new Date(a.uploadedAt!).getTime() - new Date(b.uploadedAt!).getTime(),
    )
    .map((v) => ({
      date: new Date(v.uploadedAt!).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      views: v.views ?? 0,
      bookmarks: v.bookmarks ?? 0,
    }));

  // ── Top videos ──
  const topVideos = [...videos]
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Audience Analytics
        </h3>
        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value as AnalysisMode)}
            disabled={analyzing}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            title={MODE_DESCRIPTIONS[selectedMode]}
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Config gear */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="rounded-md border p-1.5 hover:bg-muted"
            title="Analysis settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {/* Analyze button */}
          <button
            onClick={startAnalysis}
            disabled={analyzing}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : analytics ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {analyzing ? "Analyzing..." : analytics ? "Re-analyze" : "Analyze"}
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && <ConfigPanel onClose={() => setShowConfig(false)} />}

      {/* Progress bar */}
      {analyzing && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{progressMsg}</p>
        </div>
      )}

      {/* No data state */}
      {!analytics && !analyzing && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No audience analytics yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Click &quot;Analyze&quot; to scrape comments and estimate audience demographics
          </p>
        </div>
      )}

      {/* Analytics content */}
      {analytics && (
        <>
          {/* Influencer Profile Card */}
          {(analytics.influencerGender ||
            analytics.influencerAgeRange ||
            analytics.influencerEthnicity) && (
            <section className="rounded-lg border p-4">
              <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Influencer Profile
              </h4>
              <div className="flex items-center gap-4">
                {avatarUrl && (
                  <img
                    src={avatarUrl}
                    alt={username}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {analytics.influencerGender &&
                    analytics.influencerGender !== "unknown" && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {analytics.influencerGender === "male" ? "Male" : "Female"}
                      </span>
                    )}
                  {analytics.influencerAgeRange &&
                    analytics.influencerAgeRange !== "unknown" && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        {analytics.influencerAgeRange}
                      </span>
                    )}
                  {analytics.influencerEthnicity &&
                    analytics.influencerEthnicity !== "Unknown" && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {analytics.influencerEthnicity}
                      </span>
                    )}
                </div>
              </div>
            </section>
          )}

          {/* Demographics Row */}
          <section>
            <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Audience Demographics
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Gender Donut */}
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Gender
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Male", value: analytics.genderBreakdown.male },
                        { name: "Female", value: analytics.genderBreakdown.female },
                        { name: "Unknown", value: analytics.genderBreakdown.unknown },
                      ].filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {[0, 1, 2].map((i) => (
                        <Cell key={i} fill={GENDER_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) => `${value}%`}
                    />
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Age Brackets */}
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Age Distribution
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={Object.entries(analytics.ageBrackets).map(
                      ([bracket, pct], i) => ({
                        bracket,
                        pct,
                        fill: AGE_COLORS[i % AGE_COLORS.length],
                      }),
                    )}
                    layout="vertical"
                    margin={{ left: 10, right: 10 }}
                  >
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="bracket"
                      width={40}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip formatter={(value: unknown) => `${value}%`} />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {Object.entries(analytics.ageBrackets).map(([, ], i) => (
                        <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Countries */}
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Top Countries
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={analytics.topCountries.slice(0, 5)}
                    layout="vertical"
                    margin={{ left: 10, right: 10 }}
                  >
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="country"
                      width={30}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(value: unknown) => `${value}%`}
                      labelFormatter={(label) => {
                        const match = analytics.topCountries.find(
                          (c) => c.country === String(label),
                        );
                        return match?.countryName ?? String(label);
                      }}
                    />
                    <Bar dataKey="percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Ethnicity Breakdown (only for Hybrid/Full Vision) */}
          {analytics.ethnicityBreakdown &&
            Object.keys(analytics.ethnicityBreakdown).length > 0 && (
              <section>
                <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Audience Ethnicity
                </h4>
                <div className="rounded-lg border p-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={Object.entries(analytics.ethnicityBreakdown)
                          .filter(([, v]) => v > 0)
                          .map(([name, value]) => ({ name, value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {Object.entries(analytics.ethnicityBreakdown)
                          .filter(([, v]) => v > 0)
                          .map(([, ], i) => (
                            <Cell
                              key={i}
                              fill={ETHNICITY_COLORS[i % ETHNICITY_COLORS.length]}
                            />
                          ))}
                      </Pie>
                      <Tooltip formatter={(value: unknown) => `${value}%`} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

          {/* Engagement Trends */}
          {engagementData.length > 2 && (
            <section>
              <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Engagement Trends
              </h4>
              <div className="rounded-lg border p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={engagementData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${Math.round(v / 1_000)}K`
                            : String(v)
                      }
                    />
                    <Tooltip
                      formatter={(value: unknown) => {
                        const v = Number(value);
                        return v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${Math.round(v / 1_000)}K`
                            : String(v);
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name="Views"
                    />
                    <Line
                      type="monotone"
                      dataKey="bookmarks"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name="Bookmarks"
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Content Performance */}
          {topVideos.length > 0 && (
            <section>
              <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Top Performing Content
              </h4>
              <div className="space-y-2">
                {topVideos.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <span className="text-xs font-bold text-muted-foreground">
                      #{i + 1}
                    </span>
                    {v.thumbnailUrl && (
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        className="h-10 w-8 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {v.title ?? "Untitled"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {v.uploadedAt
                          ? new Date(v.uploadedAt).toLocaleDateString()
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold">
                        {formatNumber(v.views ?? 0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">views</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audience Interests */}
          {analytics.topInterests.length > 0 && (
            <section>
              <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Audience Interests
              </h4>
              <div className="flex flex-wrap gap-2">
                {analytics.topInterests.map((interest, i) => (
                  <span
                    key={i}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={{
                      opacity: 0.5 + (interest.score / 100) * 0.5,
                    }}
                  >
                    {interest.category}
                    <span className="ml-1.5 text-muted-foreground">
                      {interest.score}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Metadata Footer */}
          <section className="flex flex-wrap items-center gap-3 border-t pt-4 text-[10px] text-muted-foreground">
            <span>
              Mode: <strong>{MODE_LABELS[analytics.mode as AnalysisMode] ?? analytics.mode}</strong>
            </span>
            <span>|</span>
            <span>{analytics.commentCount} comments analyzed</span>
            {analytics.avatarsSampled > 0 && (
              <>
                <span>|</span>
                <span>{analytics.avatarsSampled} avatars sampled</span>
              </>
            )}
            <span>|</span>
            <span>
              Confidence:{" "}
              <strong
                className={
                  analytics.confidence >= 0.7
                    ? "text-emerald-600"
                    : analytics.confidence >= 0.4
                      ? "text-amber-600"
                      : "text-red-600"
                }
              >
                {Math.round(analytics.confidence * 100)}%
              </strong>
            </span>
            <span>|</span>
            <span>
              Analyzed:{" "}
              {new Date(analytics.lastAnalyzedAt).toLocaleDateString()}
            </span>
            {analytics.audienceQuality !== null && (
              <>
                <span>|</span>
                <span>Quality: {analytics.audienceQuality}/100</span>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── Config Panel ───────────────────────────────────────────

function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState({
    videosToSample: 20,
    commentsPerVideo: 50,
    maxTotalComments: 1000,
    avatarsToAnalyze: 100,
    commentBatchSize: 200,
  });
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    fetch("/api/analytics/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          videosToSample: data.videosToSample ?? 20,
          commentsPerVideo: data.commentsPerVideo ?? 50,
          maxTotalComments: data.maxTotalComments ?? 1000,
          avatarsToAnalyze: data.avatarsToAnalyze ?? 100,
          commentBatchSize: data.commentBatchSize ?? 200,
        });
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/analytics/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      toast.success("Settings saved");
      onClose();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof typeof config; label: string; min: number; max: number }[] = [
    { key: "videosToSample", label: "Videos to sample", min: 3, max: 50 },
    { key: "commentsPerVideo", label: "Comments per video", min: 10, max: 200 },
    { key: "maxTotalComments", label: "Max total comments", min: 100, max: 5000 },
    { key: "avatarsToAnalyze", label: "Avatars to analyze", min: 10, max: 500 },
    { key: "commentBatchSize", label: "Comment batch size", min: 50, max: 500 },
  ];

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Analysis Settings
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-[10px] font-medium text-muted-foreground">
              {f.label}
            </label>
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={config[f.key]}
              onChange={(e) =>
                setConfig({ ...config, [f.key]: Number(e.target.value) })
              }
              className="mt-1 h-7 w-full rounded border bg-background px-2 text-xs"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}
