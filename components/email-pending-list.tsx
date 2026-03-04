"use client";

import { Clock, Reply } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useEmailRefresh } from "@/app/lib/email-events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PendingItem {
  id: string;
  from: string;
  subject: string;
  receivedAt: string | null;
  daysSince: number;
  influencer: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export function PendingResponseList() {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/email/pending-responses", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  useEmailRefresh(fetchPending);

  const handleReply = (item: PendingItem) => {
    const params = new URLSearchParams({
      to: item.from,
      subject: item.subject.startsWith("Re:")
        ? item.subject
        : `Re: ${item.subject}`,
      influencerId: item.influencer.id,
    });
    router.push(`/email/compose?${params}`);
  };

  const handleView = (item: PendingItem) => {
    router.push(`/email/inbox/${item.id}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Pending Responses</h2>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length}
            </Badge>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Clock className="h-10 w-10 opacity-40" />
          <p className="text-sm">All caught up! No pending responses.</p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-y">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
                onClick={() => handleView(item)}
              >
                {/* Influencer avatar */}
                {item.influencer.avatarUrl ? (
                  <img
                    src={`/api/thumbnail?url=${encodeURIComponent(item.influencer.avatarUrl)}`}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                    {(
                      item.influencer.displayName ?? item.influencer.username
                    )
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      @{item.influencer.username}
                    </span>
                    {item.influencer.displayName && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.influencer.displayName}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.subject}
                  </p>
                </div>

                {/* Days since */}
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      item.daysSince >= 7
                        ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                        : item.daysSince >= 3
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.daysSince}d ago
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReply(item);
                    }}
                    title="Reply"
                  >
                    <Reply className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
