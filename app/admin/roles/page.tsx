"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FEATURES } from "@/app/lib/permissions-client";
import { RefreshCw, Save } from "lucide-react";

const ACTIONS = ["read", "write", "delete"] as const;

const FEATURE_LABELS: Record<string, string> = {
  [FEATURES.DATA_SCRAPER]: "Data Scraper",
  [FEATURES.CSV_UPLOAD]: "CSV Upload",
  [FEATURES.IMPORTS]: "Imports",
  [FEATURES.AI_FILTER]: "AI Filter / Campaigns",
  [FEATURES.QUEUES]: "Queues",
  [FEATURES.INFLUENCERS]: "Influencers",
  [FEATURES.NOTIFICATIONS]: "Notifications",
  [FEATURES.USERS]: "User management",
};

const FEATURE_KEYS = Object.values(FEATURES);

type RoleWithPermissions = {
  id: string;
  name: string;
  permissions: { feature: string; action: string }[];
};

function setToKey(p: { feature: string; action: string }): string {
  return `${p.feature}:${p.action}`;
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to load roles");
        setRoles([]);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data.roles) ? data.roles : [];
      setRoles(list);
      if (list.length > 0 && !selectedRoleId) {
        setSelectedRoleId(list[0].id);
      }
      if (selectedRoleId && list.some((r: RoleWithPermissions) => r.id === selectedRoleId)) {
        const role = list.find((r: RoleWithPermissions) => r.id === selectedRoleId);
        if (role) setChecked(new Set(role.permissions.map(setToKey)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedRoleId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // When selected role changes, set checkboxes from that role's permissions
  useEffect(() => {
    if (!selectedRoleId) return;
    const role = roles.find((r) => r.id === selectedRoleId);
    if (role) setChecked(new Set(role.permissions.map(setToKey)));
  }, [selectedRoleId, roles]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  function toggle(feature: string, action: string) {
    const key = setToKey({ feature, action });
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!selectedRoleId) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const permissions = Array.from(checked).map((key) => {
        const [feature, action] = key.split(":");
        return { feature, action };
      });
      const res = await fetch(`/api/admin/roles/${selectedRoleId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setMessage("Permissions saved. Users with this role may need to sign out and sign in to see changes.");
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRoleId
            ? { ...r, permissions: data.permissions ?? r.permissions }
            : r,
        ),
      );
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (error && roles.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-2xl font-bold">Roles & permissions</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Roles & permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose which features and actions each role can use. Changes apply to all users with that role.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedRoleId ?? ""}
            onChange={(e) => setSelectedRoleId(e.target.value || null)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => fetchRoles()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
          {message}
        </div>
      )}

      {selectedRole && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3 font-medium">
            Permissions for {selectedRole.name}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Feature</TableHead>
                  <TableHead className="text-center w-24">Read</TableHead>
                  <TableHead className="text-center w-24">Write</TableHead>
                  <TableHead className="text-center w-24">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FEATURE_KEYS.map((feature) => (
                  <TableRow key={feature}>
                    <TableCell className="font-medium">
                      {FEATURE_LABELS[feature] ?? feature}
                    </TableCell>
                    {ACTIONS.map((action) => {
                      const key = setToKey({ feature, action });
                      return (
                        <TableCell key={key} className="text-center">
                          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={checked.has(key)}
                              onChange={() => toggle(feature, action)}
                              className="h-4 w-4 rounded border-input"
                            />
                            <span className="sr-only">{action}</span>
                          </label>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end border-t p-4">
            <Button
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving…
                </span>
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save permissions
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
