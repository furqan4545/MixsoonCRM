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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

  const handleSync = () => {
    startSync(async () => {
      try {
        const res = await fetch("/api/email/sync", { method: "POST" });
        if (res.ok) fetchCounts();
      } catch {}
    });
  };

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r bg-muted/30">
      <div className="flex flex-col gap-2 p-3">
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
      <Separator />
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-2">
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
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                <folder.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{folder.title}</span>
                {count > 0 && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
      <Separator />
      <div className="p-2">
        <Link
          href="/email/settings"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
            pathname === "/email/settings" && "bg-accent text-accent-foreground",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
    </div>
  );
}
