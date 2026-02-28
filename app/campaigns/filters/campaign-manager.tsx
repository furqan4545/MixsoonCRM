"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Campaign = {
  id: string;
  name: string;
  notes: string | null;
  strictnessDefault: number;
  targetKeywords: string[];
  avoidKeywords: string[];
};

function toCsv(items: string[]) {
  return items.join(", ");
}

function fromCsv(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function CampaignManager({
  initialCampaigns,
}: {
  initialCampaigns: Campaign[];
}) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("");
  const [strictnessDefault, setStrictnessDefault] = useState(50);
  const [targetKeywords, setTargetKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createCampaign() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          strictnessDefault,
          targetKeywords: fromCsv(targetKeywords),
          avoidKeywords: fromCsv(avoidKeywords),
          notes,
        }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to create campaign");
      }
      const campaign = (await res.json()) as Campaign;
      setCampaigns((prev) => [campaign, ...prev]);
      setName("");
      setStrictnessDefault(50);
      setTargetKeywords("");
      setAvoidKeywords("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign filter?")) return;
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Failed to delete campaign");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 font-semibold">New Campaign Filter</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Campaign name (e.g. Dalba Beauty)"
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
            placeholder="Notes for AI (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <Button className="mt-4" onClick={createCampaign} disabled={loading || !name.trim()}>
          {loading ? "Saving..." : "Save Campaign Filter"}
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4 font-semibold">
          Saved Campaign Filters
        </div>
        {campaigns.length === 0 ? (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            No saved filters yet.
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Strictness {c.strictnessDefault}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteCampaign(c.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Target: {toCsv(c.targetKeywords) || "none"} | Avoid:{" "}
                  {toCsv(c.avoidKeywords) || "none"}
                </p>
                {c.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
