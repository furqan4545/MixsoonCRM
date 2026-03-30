"use client";

import {
  AlertTriangle,
  ChevronDown,
  Clock,
  FileEdit,
  FileText,
  History,
  Inbox,
  PenSquare,
  RefreshCw,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { emitEmailRefresh, useEmailRefresh } from "@/app/lib/email-events";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const AUTO_SYNC_INTERVAL_MS = 60_000; // Auto-sync every 60 seconds

const folders = [
  { title: "Inbox", href: "/email/inbox", icon: Inbox, countKey: "INBOX" },
  { title: "Sent", href: "/email/sent", icon: Send, countKey: "SENT" },
  {
    title: "Pending",
    href: "/email/pending",
    icon: Clock,
    countKey: "PENDING_RESPONSE",
  },
  {
    title: "Drafts",
    href: "/email/drafts",
    icon: FileEdit,
    countKey: "DRAFTS",
  },
  { title: "Signature", href: "/email/signature", icon: PenSquare },
  { title: "Templates", href: "/email/templates", icon: FileText },
  { title: "Spam", href: "/email/spam", icon: AlertTriangle, countKey: "SPAM" },
  { title: "Trash", href: "/email/trash", icon: Trash2, countKey: "TRASH" },
] as const;

type FolderCounts = Record<string, number>;

export function EmailSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [counts, setCounts] = useState<FolderCounts>({});
  const [syncing, setSyncing] = useState(false);
  const [deepSyncing, setDeepSyncing] = useState(false);
  const syncInFlightRef = useRef(false);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/email/counts", { cache: "no-store" });
      if (res.ok) setCounts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEmailRefresh(fetchCounts);

  const runSync = useCallback(
    async (silent = false, syncMonths = 0) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      const isDeep = syncMonths > 0;
      if (!silent) setSyncing(true);
      if (isDeep) setDeepSyncing(true);
      const controller = new AbortController();
      // Allow more time for deep syncs (5 minutes vs 2 minutes)
      const timeoutMs = isDeep ? 300000 : 120000;
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = isDeep
          ? `/api/email/sync?syncMonths=${syncMonths}`
          : "/api/email/sync";
        const res = await fetch(url, {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          skipped?: boolean;
          reason?: string;
          synced?: number;
        };

        if (res.ok) {
          if (data.skipped && data.reason === "NO_ACCOUNT") {
            if (!silent) router.push("/email/inbox");
            return;
          }
          await fetchCounts();
          // Only emit refresh if new emails were synced (or if manual sync)
          if (!silent || (data.synced && data.synced > 0)) {
            emitEmailRefresh();
            router.refresh();
          }
        }
      } catch {
      } finally {
        window.clearTimeout(timeout);
        syncInFlightRef.current = false;
        if (!silent) setSyncing(false);
        if (isDeep) setDeepSyncing(false);
      }
    },
    [fetchCounts, router],
  );

  // SSE connection for real-time email updates
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/email/stream");

      es.addEventListener("new_emails", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.count > 0) {
            fetchCounts();
            emitEmailRefresh();
            router.refresh();
          }
        } catch {}
      });

      es.addEventListener("counts", (e) => {
        try {
          const data = JSON.parse(e.data);
          setCounts(data);
        } catch {}
      });

      es.addEventListener("timeout", () => {
        // Reconnect after SSE timeout
        es?.close();
        retryTimer = setTimeout(connect, 2000);
      });

      es.onerror = () => {
        es?.close();
        // Retry after 5s on error
        retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, [fetchCounts, router]);

  const handleSync = () => {
    void runSync(false);
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-[220px] shrink-0 flex-col overflow-hidden border-r border-sidebar-border">
      <div className="flex flex-col gap-2 border-b border-sidebar-border p-3">
        <Button asChild size="sm" className="w-full justify-start gap-2">
          <Link href="/email/compose">
            <PenSquare className="h-4 w-4" />
            Compose
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          disabled={syncing}
          onClick={handleSync}
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing
            ? deepSyncing
              ? "Deep Syncing..."
              : "Syncing..."
            : "Sync Mail"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              disabled={syncing}
            >
              <History className="h-4 w-4" />
              <span className="flex-1 text-left">Sync History</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[188px]">
            <DropdownMenuItem
              onClick={() => void runSync(false, 1)}
              disabled={syncing}
            >
              Last 1 month
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void runSync(false, 2)}
              disabled={syncing}
            >
              Last 2 months
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {syncing && (
          <div className="h-1 w-full overflow-hidden rounded bg-muted">
            <div className="email-sync-bar h-full w-1/3 rounded bg-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 p-2">
        <div className="flex flex-col gap-1">
          <p className="px-2 py-1 text-xs font-medium text-sidebar-foreground/50">
            Folders
          </p>
          {folders.map((folder) => {
            const isActive =
              pathname === folder.href ||
              pathname.startsWith(`${folder.href}/`);
            const count =
              "countKey" in folder ? (counts[folder.countKey] ?? 0) : 0;
            return (
              <Link
                key={folder.href}
                href={folder.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground",
                )}
              >
                <folder.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{folder.title}</span>
                {"countKey" in folder && count > 0 && (
                  <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-sidebar-primary-foreground">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-auto border-t border-sidebar-border p-2">
        <Link
          href="/email/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            pathname === "/email/settings"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
      <style jsx>{`
        .email-sync-bar {
          animation: email-sync-slide 1.1s ease-in-out infinite;
        }

        @keyframes email-sync-slide {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(360%);
          }
        }
      `}</style>
    </div>
  );
}
