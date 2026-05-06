"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Share2, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ShareUser {
  id: string;
  name: string | null;
  email: string;
}

interface ShareRow {
  id: string;
  permission: string;
  user: ShareUser;
}

export function ShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceLabel,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  resourceType: string;
  resourceId: string;
  resourceLabel: string;
}) {
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [pickedUserId, setPickedUserId] = useState<string>("");
  const [pickedPermission, setPickedPermission] = useState<string>("read");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sharesRes, usersRes] = await Promise.all([
        fetch(
          `/api/resource-shares?resourceType=${encodeURIComponent(resourceType)}&resourceId=${encodeURIComponent(resourceId)}`,
        ),
        fetch("/api/users/share-targets"),
      ]);
      if (!sharesRes.ok) {
        const data = await sharesRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load shares");
      }
      const sharesData = (await sharesRes.json()) as {
        shares: ShareRow[];
        ownerId: string | null;
      };
      setShares(sharesData.shares);
      setOwnerId(sharesData.ownerId);
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        const list: ShareUser[] = Array.isArray(usersData)
          ? usersData
          : usersData.users ?? [];
        setUsers(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const addShare = async () => {
    if (!pickedUserId) return;
    setAdding(true);
    try {
      const res = await fetch("/api/resource-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType,
          resourceId,
          userId: pickedUserId,
          permission: pickedPermission,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      setPickedUserId("");
      setPickedPermission("read");
      await refresh();
      toast.success("Access granted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share");
    } finally {
      setAdding(false);
    }
  };

  const revokeShare = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/resource-shares?resourceType=${encodeURIComponent(resourceType)}&resourceId=${encodeURIComponent(resourceId)}&userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      await refresh();
      toast.success("Access revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke");
    }
  };

  const sharedUserIds = new Set(shares?.map((s) => s.user.id) ?? []);
  const availableUsers = users.filter(
    (u) => u.id !== ownerId && !sharedUserIds.has(u.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share {resourceLabel}
          </DialogTitle>
          <DialogDescription>
            Grant other users access to this resource. Removing a share immediately
            revokes their access.
          </DialogDescription>
        </DialogHeader>

        {/* Add new share */}
        <div className="rounded-lg border p-3 bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Add user
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={pickedUserId} onValueChange={setPickedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Choose user…" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No users available
                  </SelectItem>
                ) : (
                  availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name ?? u.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Select value={pickedPermission} onValueChange={setPickedPermission}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">View</SelectItem>
                <SelectItem value="write">Edit</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={addShare}
              disabled={!pickedUserId || adding}
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              <span className="ml-1.5">Share</span>
            </Button>
          </div>
        </div>

        {/* Existing shares */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Shared with
          </p>
          {loading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          {!loading && !error && shares && shares.length === 0 && (
            <p className="text-xs text-muted-foreground italic px-1">
              Not shared with anyone yet.
            </p>
          )}
          <div className="space-y-1">
            {shares?.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.user.name ?? s.user.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {s.user.email}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    s.permission === "admin"
                      ? "border-purple-200 bg-purple-50 text-purple-700"
                      : s.permission === "write"
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-gray-50 text-gray-700"
                  }
                >
                  {s.permission === "admin"
                    ? "Admin"
                    : s.permission === "write"
                      ? "Edit"
                      : "View"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => revokeShare(s.user.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
