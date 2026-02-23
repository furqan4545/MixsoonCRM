"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "@/app/lib/date-utils";
import { Star, MailOpen, Mail } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmailItem {
  id: string;
  from: string;
  to: string[];
  subject: string;
  preview: string;
  folder: string;
  isRead: boolean;
  isStarred: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}

interface Props {
  folder: string;
  title: string;
}

export function EmailList({ folder, title }: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        folder,
        page: String(page),
        pageSize: "30",
      });
      if (search) params.set("q", search);

      const res = await fetch(`/api/email?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [folder, page, search]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmails();
  };

  const getDate = (item: EmailItem) => {
    const d = item.sentAt ?? item.receivedAt ?? item.createdAt;
    return d ? formatDistanceToNow(new Date(d)) : "";
  };

  const displayAddress = (item: EmailItem) => {
    if (folder === "SENT" || folder === "DRAFTS") {
      return item.to[0] ?? "—";
    }
    return item.from;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{total} messages</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            placeholder="Search emails..."
            className="h-8 w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <ScrollArea className="flex-1">
        {loading && emails.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Loading...
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Mail className="mb-3 h-10 w-10" />
            <p>No emails in {title.toLowerCase()}</p>
          </div>
        ) : (
          <div className="divide-y">
            {emails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => router.push(`/email/${email.id}`)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  !email.isRead && "bg-accent/30",
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {email.isRead ? (
                    <MailOpen className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Mail className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm",
                        !email.isRead && "font-semibold",
                      )}
                    >
                      {displayAddress(email)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {getDate(email)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "truncate text-sm",
                      !email.isRead ? "font-medium" : "text-muted-foreground",
                    )}
                  >
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {email.preview}
                  </p>
                </div>
                {email.isStarred && (
                  <Star className="mt-0.5 h-4 w-4 shrink-0 fill-yellow-400 text-yellow-400" />
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
