"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/* ─── Types ─── */
type Campaign = {
  id: string;
  name: string;
  notes: string | null;
  strictnessDefault: number;
  targetKeywords: string[];
  avoidKeywords: string[];
};

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

function toCsv(items: string[]) {
  return items.join(", ");
}

function fromCsv(value: string) {
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/* ─── Page ─── */
export default function AiFilterPage() {
  const [tab, setTab] = useState<"filters" | "runs">("filters");

  // Filter management state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [name, setName] = useState("");
  const [strictnessDefault, setStrictnessDefault] = useState(50);
  const [targetKeywords, setTargetKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Run history state
  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCampaigns(Array.isArray(data) ? data : data.campaigns ?? []))
      .catch(() => {})
      .finally(() => setLoadingCampaigns(false));

    fetch("/api/ai/filter/runs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRuns(data))
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, []);

  async function saveFilter() {
    setSaving(true);
    try {
      const payload = {
        name,
        strictnessDefault,
        targetKeywords: fromCsv(targetKeywords),
        avoidKeywords: fromCsv(avoidKeywords),
        notes,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/campaigns/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const p = await res.json();
        throw new Error(p.error || "Failed to save");
      }
      const campaign = (await res.json()) as Campaign;

      if (editingId) {
        setCampaigns((prev) => prev.map((c) => (c.id === editingId ? campaign : c)));
        toast.success("Filter updated");
      } else {
        setCampaigns((prev) => [campaign, ...prev]);
        toast.success("Filter created");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save filter");
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setStrictnessDefault(50);
    setTargetKeywords("");
    setAvoidKeywords("");
    setNotes("");
  }

  function startEdit(c: Campaign) {
    setEditingId(c.id);
    setName(c.name);
    setStrictnessDefault(c.strictnessDefault);
    setTargetKeywords(toCsv(c.targetKeywords));
    setAvoidKeywords(toCsv(c.avoidKeywords));
    setNotes(c.notes ?? "");
  }

  async function deleteFilter(id: string) {
    if (!confirm("Delete this filter? This cannot be undone.")) return;
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete filter");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) resetForm();
    toast.success("Filter deleted");
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight">AI Filter</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create and manage AI filters, then view scoring run history.
      </p>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg border bg-muted/50 p-1 w-fit">
        <button
          onClick={() => setTab("filters")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "filters"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Manage Filters
        </button>
        <button
          onClick={() => setTab("runs")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "runs"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Run History{runs.length > 0 ? ` (${runs.length})` : ""}
        </button>
      </div>

      {/* ─── Manage Filters Tab ─── */}
      {tab === "filters" && (
        <div className="mt-5 space-y-6">
          {/* Create / Edit form */}
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 font-semibold">
              {editingId ? "Edit Filter" : "New Filter"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Filter name (e.g. Dalba Beauty)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="rounded-md border px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Strictness: {strictnessDefault}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={strictnessDefault}
                  onChange={(e) => setStrictnessDefault(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>
              <textarea
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Target keywords (comma separated): beauty, skincare, makeup"
                value={targetKeywords}
                onChange={(e) => setTargetKeywords(e.target.value)}
              />
              <textarea
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Avoid keywords (comma separated): news, politics, sports"
                value={avoidKeywords}
                onChange={(e) => setAvoidKeywords(e.target.value)}
              />
              <textarea
                className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Notes / instructions for AI (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={saveFilter} disabled={saving || !name.trim()}>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Filter"
                    : "Save Filter"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* Saved filters list */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4 font-semibold">
              Saved Filters ({campaigns.length})
            </div>
            {loadingCampaigns ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No saved filters yet. Create one above.
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      editingId === c.id ? "border-blue-400 bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Target: {toCsv(c.targetKeywords) || "none"} · Avoid:{" "}
                          {toCsv(c.avoidKeywords) || "none"}
                        </p>
                        {c.notes && (
                          <p className="mt-1 text-xs text-muted-foreground italic">
                            {c.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          Strictness {c.strictnessDefault}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(c)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => deleteFilter(c.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Run History Tab ─── */}
      {tab === "runs" && (
        <div className="mt-5">
          {loadingRuns && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {!loadingRuns && runs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No AI filter runs yet. Go to an import and run the AI filter.
            </p>
          )}

          {!loadingRuns && runs.length > 0 && (
            <div className="space-y-2">
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
      )}
    </div>
  );
}
