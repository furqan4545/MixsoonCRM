"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCheck, RefreshCw, Trash2 } from "lucide-react";

type NotificationRow = {
  id: string;
  type: string;
  status: string;
  title: string;
  message: string | null;
  read: boolean;
  importId: string | null;
  runId: string | null;
  createdAt: string;
};

const AUTO_REFRESH_INTERVAL = 5000;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/notifications?limit=500");
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(list);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      if (!res.ok && list.length === 0) {
        setFetchError(data.error ?? `Request failed (${res.status})`);
      }
    } catch (e) {
      console.error("Notifications fetch error:", e);
      setFetchError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchAll(false), AUTO_REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchAll]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    try {
      await fetch("/api/notifications", { method: "DELETE" });
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }

  function formatDate(createdAt: string) {
    const d = new Date(createdAt);
    return d.toLocaleString();
  }

  function formatRelative(createdAt: string) {
    const d = new Date(createdAt);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            All logs — success, failure, and info. Stored in the database.
            {unreadCount > 0 && (
              <span className="ml-2 font-medium text-primary">
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
          <Button variant="outline" size="sm" onClick={() => fetchAll(true)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearAll} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {fetchError
              ? "Could not load notifications."
              : "No notifications yet. Save an import or run an AI filter to see logs here."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-44">Time</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="max-w-md">Message</TableHead>
                <TableHead className="w-24">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((n) => (
                <TableRow
                  key={n.id}
                  className={!n.read ? "bg-primary/3" : ""}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  <TableCell className="w-8 px-2">
                    {!n.read && (
                      <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{formatRelative(n.createdAt)}</div>
                    <div className="text-[10px]">{formatDate(n.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{n.type}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        n.status === "error"
                          ? "destructive"
                          : n.status === "success"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {n.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={`font-medium ${!n.read ? "" : "text-muted-foreground"}`}>
                    {n.title}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                    {n.message ?? "—"}
                  </TableCell>
                  <TableCell>
                    {n.runId && (
                      <Link
                        href={`/ai-filter/${n.runId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View run
                      </Link>
                    )}
                    {n.importId && !n.runId && (
                      <Link
                        href={`/imports/${n.importId}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View import
                      </Link>
                    )}
                    {!n.runId && !n.importId && "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
