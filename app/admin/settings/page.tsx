"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminSettingsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/system/isolation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEnabled(d?.adminIsolationEnabled ?? false))
      .catch(() => setEnabled(false));
  }, []);

  const onToggle = async (next: boolean) => {
    setSaving(true);
    const previous = enabled;
    setEnabled(next);
    try {
      const res = await fetch("/api/system/isolation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      toast.success(
        next
          ? "Admin isolation enabled — admins now see only their own + shared data"
          : "Admin isolation disabled — admins see everything (default)",
      );
    } catch (e) {
      setEnabled(previous);
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-3xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tenant-wide configuration. Only Admins can change these.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Shield className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base">Admin data isolation</CardTitle>
              <CardDescription className="mt-1">
                When enabled, admin accounts only see CSVs, influencers, contracts and
                payments they created or have been shared with — same as PIC users.
                When disabled (default), admins see everything.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              {enabled === null ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Lock
                  className={`h-4 w-4 ${enabled ? "text-emerald-600" : "text-muted-foreground"}`}
                />
              )}
              <div>
                <p className="text-sm font-medium">
                  Isolate admin accounts
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {enabled
                    ? "Admins only see their own + shared data"
                    : "Admins see all data (no isolation)"}
                </p>
              </div>
            </div>
            <Switch
              checked={!!enabled}
              disabled={enabled === null || saving}
              onCheckedChange={onToggle}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Setting cached for up to 30 seconds across the API surface, so changes may take
            a moment to take effect on every endpoint.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
