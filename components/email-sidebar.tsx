"use client";

import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  AlertTriangle,
  PenSquare,
  Settings,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emitEmailRefresh, useEmailRefresh } from "@/app/lib/email-events";

const folders = [
  { title: "Inbox", href: "/email/inbox", icon: Inbox, countKey: "INBOX" },
  { title: "Sent", href: "/email/sent", icon: Send, countKey: "SENT" },
  { title: "Drafts", href: "/email/drafts", icon: FileEdit, countKey: "DRAFTS" },
  { title: "Spam", href: "/email/spam", icon: AlertTriangle, countKey: "SPAM" },
  { title: "Trash", href: "/email/trash", icon: Trash2, countKey: "TRASH" },
] as const;

type FolderCounts = Record<string, number>;

export function EmailSidebar() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<FolderCounts>({});
  const [syncing, startSync] = useTransition();

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/email/counts");
      if (res.ok) setCounts(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEmailRefresh(fetchCounts);

  const handleSync = () => {
    startSync(async () => {
      try {
        const res = await fetch("/api/email/sync", { method: "POST" });
        if (res.ok) {
          fetchCounts();
          emitEmailRefresh();
        }
      } catch {}
    });
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
          className="w-full justify-start gap-2"
          disabled={syncing}
          onClick={handleSync}
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          {syncing ? "Syncing..." : "Sync Mail"}
        </Button>
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
            const count = counts[folder.countKey] ?? 0;
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
                {count > 0 && (
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
    </div>
  );
}
