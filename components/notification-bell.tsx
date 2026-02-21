"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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

const POLL_INTERVAL = 3000;

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const prevCountRef = useRef(0);
  const [animateBadge, setAnimateBadge] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.notifications) ? data.notifications : [];
      const newUnread = typeof data.unreadCount === "number" ? data.unreadCount : 0;

      setNotifications(list);
      setUnreadCount(newUnread);

      if (newUnread > prevCountRef.current) {
        setAnimateBadge(true);
        setTimeout(() => setAnimateBadge(false), 600);
      }
      prevCountRef.current = newUnread;
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);

    const onEvent = () => {
      setTimeout(fetchNotifications, 300);
    };

    window.addEventListener("save-import-started", onEvent);
    window.addEventListener("save-import-complete", onEvent);
    window.addEventListener("ai-filter-started", onEvent);
    window.addEventListener("ai-filter-complete", onEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener("save-import-started", onEvent);
      window.removeEventListener("save-import-complete", onEvent);
      window.removeEventListener("ai-filter-started", onEvent);
      window.removeEventListener("ai-filter-complete", onEvent);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      prevCountRef.current = 0;
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    try {
      await fetch("/api/notifications", { method: "DELETE" });
      setNotifications([]);
      setUnreadCount(0);
      prevCountRef.current = 0;
    } catch {
      // ignore
    }
  }

  function formatTime(createdAt: string) {
    const d = new Date(createdAt);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  }

  function handleSelect() {
    setOpen(false);
    router.push("/notifications");
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 hover:bg-muted"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground transition-transform ${animateBadge ? "scale-125" : "scale-100"}`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllRead();
                }}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No notifications yet. Success and error logs appear here.
            </p>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => handleSelect()}
                className={`flex cursor-pointer flex-col items-start gap-0.5 py-2 ${
                  n.status === "error" ? "bg-destructive/5" : ""
                } ${!n.read ? "bg-primary/5" : ""}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {!n.read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span
                      className={`text-sm ${n.read ? "text-muted-foreground" : "font-medium"} ${n.status === "error" ? "text-destructive" : ""}`}
                    >
                      {n.title}
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatTime(n.createdAt)}
                    {n.status === "error" && " • Error"}
                  </span>
                </div>
                {n.message && (
                  <span
                    className={`line-clamp-2 text-xs ${n.status === "error" ? "text-destructive/90" : "text-muted-foreground"}`}
                  >
                    {n.message}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
