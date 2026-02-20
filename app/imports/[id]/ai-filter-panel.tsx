"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Campaign = {
  id: string;
  name: string;
  strictnessDefault: number;
  targetKeywords: string[];
  avoidKeywords: string[];
};

type RunSummary = {
  id: string;
  status: string;
  createdAt: string | Date;
  approvedCount: number;
  okishCount: number;
  rejectedCount: number;
  reviewQueueCount: number;
  campaign: { id: string; name: string };
};

function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function AiFilterPanel({
  importId,
  latestRuns,
}: {
  importId: string;
  latestRuns: RunSummary[];
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [strictness, setStrictness] = useState(50);
  const [targetKeywords, setTargetKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      const res = await fetch("/api/campaigns");
      if (!res.ok) return;
      const list = (await res.json()) as Campaign[];
      if (ignore) return;
      setCampaigns(list);
      if (list.length > 0) {
        const first = list[0];
        setSelectedCampaignId(first.id);
        setStrictness(first.strictnessDefault);
        setTargetKeywords(first.targetKeywords.join(", "));
        setAvoidKeywords(first.avoidKeywords.join(", "));
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  function onCampaignChange(id: string) {
    setSelectedCampaignId(id);
    const c = campaigns.find((item) => item.id === id);
    if (!c) return;
    setStrictness(c.strictnessDefault);
    setTargetKeywords(c.targetKeywords.join(", "));
    setAvoidKeywords(c.avoidKeywords.join(", "));
  }

  async function saveFiltersToCampaign() {
    if (!selectedCampaign) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${selectedCampaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strictnessDefault: strictness,
          targetKeywords: csvToArray(targetKeywords),
          avoidKeywords: csvToArray(avoidKeywords),
        }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to save campaign filters");
      }
      const updated = (await res.json()) as Campaign;
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setLoading(false);
    }
  }

  async function runAiFilter() {
    if (!selectedCampaignId) {
      setError("Please select a campaign");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedCampaignId,
          importId,
          strictness,
          targetKeywords: csvToArray(targetKeywords),
          avoidKeywords: csvToArray(avoidKeywords),
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || payload.details || "AI filter failed");
      }
      router.push(`/ai-filter/${payload.runId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI filter failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Filter</h2>
          <p className="text-sm text-muted-foreground">
            Select a saved campaign filter, tweak keywords, then run Gemini
            scoring.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/campaigns")}>
          Manage Campaign Filters
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedCampaignId}
          onChange={(e) => onCampaignChange(e.target.value)}
        >
          <option value="">Select campaign</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <label className="rounded-md border px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Strictness: {strictness}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={strictness}
            onChange={(e) => setStrictness(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </label>
        <textarea
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
          placeholder="Target keywords (comma separated). Leave empty for no pre-check."
          value={targetKeywords}
          onChange={(e) => setTargetKeywords(e.target.value)}
        />
        <textarea
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm md:col-span-2"
          placeholder="Avoid keywords (comma separated). Leave empty for no pre-check."
          value={avoidKeywords}
          onChange={(e) => setAvoidKeywords(e.target.value)}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        If both target and avoid filters are empty, pre-check is disabled and
        all influencers go to AI scoring.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex gap-3">
        <Button
          variant="outline"
          disabled={loading || !selectedCampaignId}
          onClick={saveFiltersToCampaign}
        >
          {loading ? "Saving..." : "Save Filters"}
        </Button>
        <Button disabled={loading || !selectedCampaignId} onClick={runAiFilter}>
          {loading ? "Running..." : "Run AI Filter"}
        </Button>
      </div>

      {latestRuns.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <p className="mb-2 text-sm font-medium">Recent runs</p>
          <div className="space-y-2">
            {latestRuns.slice(0, 3).map((run) => (
              <button
                type="button"
                key={run.id}
                onClick={() => router.push(`/ai-filter/${run.id}`)}
                className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <div className="font-medium">
                  {run.campaign.name} ·{" "}
                  {new Date(run.createdAt).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  approved {run.approvedCount} · okish {run.okishCount} ·
                  rejected {run.rejectedCount}
                  {" · "}review queue {run.reviewQueueCount}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
