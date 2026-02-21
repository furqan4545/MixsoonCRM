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
import { Badge } from "@/components/ui/badge";
import { CheckCircle, RefreshCw, UserX } from "lucide-react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  roleId: string;
  roleName: string;
  createdAt: string;
};

type RoleOption = { id: string; name: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/roles"),
      ]);

      if (!usersRes.ok) {
        const data = await usersRes.json().catch(() => ({}));
        setError(data.error ?? "Failed to load users");
        setUsers([]);
        return;
      }
      if (!rolesRes.ok) {
        setRoles([]);
      } else {
        const rolesData = await rolesRes.json();
        setRoles(Array.isArray(rolesData.roles) ? rolesData.roles : []);
      }

      const data = await usersRes.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function updateUser(
    id: string,
    updates: { status?: string; roleId?: string },
  ) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? {
                ...u,
                status: data.status ?? u.status,
                roleId: data.roleId ?? u.roleId,
                roleName: data.roleName ?? u.roleName,
              }
            : u,
        ),
      );
    } catch {
      setError("Update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-4 text-2xl font-bold">User management</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            User management
          </h1>
          <p className="text-sm text-muted-foreground">
            Approve pending users, change roles, or suspend accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchUsers()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28">Role</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-48 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      u.status === "ACTIVE"
                        ? "default"
                        : u.status === "SUSPENDED"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <select
                    className="w-full rounded border bg-background px-2 py-1 text-sm"
                    value={u.roleId}
                    disabled={updatingId === u.id}
                    onChange={(e) => {
                      const roleId = e.target.value;
                      if (roleId !== u.roleId) updateUser(u.id, { roleId });
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  {u.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="default"
                      className="mr-1"
                      disabled={updatingId === u.id}
                      onClick={() => updateUser(u.id, { status: "ACTIVE" })}
                    >
                      <CheckCircle className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                  )}
                  {u.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={updatingId === u.id}
                      onClick={() => updateUser(u.id, { status: "SUSPENDED" })}
                    >
                      <UserX className="mr-1 h-3.5 w-3.5" />
                      Suspend
                    </Button>
                  )}
                  {u.status === "SUSPENDED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingId === u.id}
                      onClick={() => updateUser(u.id, { status: "ACTIVE" })}
                    >
                      Reactivate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
