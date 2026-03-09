"use client";

import { Inbox, Mail, MailOpen, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "@/app/lib/date-utils";
import { emitEmailRefresh, useEmailRefresh } from "@/app/lib/email-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  influencer: { id: string; username: string } | null;
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

      const res = await fetch(`/api/email?${params}`, { cache: "no-store" });
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

  useEmailRefresh(fetchEmails);

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

  const handleDelete = async (emailId: string) => {
    try {
      const res = await fetch(`/api/email/${emailId}`, { method: "DELETE" });
      if (!res.ok) return;
      emitEmailRefresh();
      fetchEmails();
    } catch {}
  };

  const handleDeleteAllTrash = async () => {
    if (folder !== "TRASH") return;
    if (!confirm("Delete all emails in Trash permanently?")) return;
    try {
      const res = await fetch("/api/email/trash", { method: "DELETE" });
      if (!res.ok) return;
      emitEmailRefresh();
      setPage(1);
      fetchEmails();
    } catch {}
  };

  const handleMoveToInbox = async (emailId: string) => {
    try {
      const res = await fetch(`/api/email/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "INBOX" }),
      });
      if (!res.ok) return;
      toast.success("Moved to inbox");
      emitEmailRefresh();
      fetchEmails();
    } catch {}
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{total} messages</p>
        </div>
        <div className="flex gap-2">
          {folder === "TRASH" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAllTrash}
              disabled={loading || total === 0}
            >
              Delete All
            </Button>
          )}
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search emails..."
              className="h-8 w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>
      </div>

      <ScrollArea className="*:data-[slot=scroll-area-viewport]:overscroll-contain min-h-0 flex-1">
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
              <div
                key={email.id}
                className={cn(
                  "group relative transition-colors hover:bg-muted/50",
                  !email.isRead && "bg-accent/30",
                )}
              >
                <button
                  type="button"
                  onClick={() => router.push(`/email/${email.id}`)}
                  className="flex w-full items-start gap-3 px-4 py-3 pr-20 text-left"
                >
                  <div className="mt-0.5 shrink-0">
                    {email.isRead ? (
                      <MailOpen className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Mail className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          !email.isRead && "font-semibold",
                        )}
                      >
                        {displayAddress(email)}
                      </span>
                      {email.influencer && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          @{email.influencer.username}
                        </span>
                      )}
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

                <div className="absolute right-4 top-3 flex flex-col items-end gap-1">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {getDate(email)}
                  </span>
                  <div className="flex items-center gap-1">
                    {folder === "SPAM" && (
                      <button
                        type="button"
                        className="opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleMoveToInbox(email.id);
                        }}
                        aria-label="Not spam – move to inbox"
                        title="Not spam – move to inbox"
                      >
                        <Inbox className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(email.id);
                      }}
                      aria-label="Delete email"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
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
