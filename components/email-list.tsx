"use client";

import { Inbox, Mail, MailOpen, Star, Trash2, User, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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

interface InfluencerOption {
  id: string;
  username: string;
}

interface Props {
  folder: string;
  title: string;
}

const STORAGE_KEY_PREFIX = "email-list-state:";

export function EmailList({ folder, title }: Props) {
  const router = useRouter();
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Influencer filter
  const [influencerFilter, setInfluencerFilter] = useState<InfluencerOption | null>(null);
  const [influencerSearch, setInfluencerSearch] = useState("");
  const [influencerOptions, setInfluencerOptions] = useState<InfluencerOption[]>([]);
  const [showInfluencerDropdown, setShowInfluencerDropdown] = useState(false);
  const influencerDropdownRef = useRef<HTMLDivElement>(null);

  // Scroll and selection restoration
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  const storageKey = `${STORAGE_KEY_PREFIX}${folder}`;

  // Restore state from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.page) setPage(state.page);
        if (state.search) setSearch(state.search);
        if (state.influencerFilter) setInfluencerFilter(state.influencerFilter);
        restoredRef.current = true;
      }
    } catch {}
  }, [storageKey]);

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          page,
          search,
          influencerFilter,
        }),
      );
    } catch {}
  }, [storageKey, page, search, influencerFilter]);

  // Restore scroll position after emails load
  useEffect(() => {
    if (!loading && emails.length > 0 && restoredRef.current) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const state = JSON.parse(saved);
          if (state.scrollTop && scrollRef.current) {
            // Find the scroll viewport inside ScrollArea
            const viewport = scrollRef.current.querySelector(
              "[data-slot=scroll-area-viewport]",
            );
            if (viewport) {
              requestAnimationFrame(() => {
                viewport.scrollTop = state.scrollTop;
              });
            }
          }
        }
      } catch {}
      restoredRef.current = false;
    }
  }, [loading, emails.length, storageKey]);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        folder,
        page: String(page),
        pageSize: "30",
      });
      if (search) params.set("q", search);
      if (influencerFilter) params.set("influencerId", influencerFilter.id);

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
  }, [folder, page, search, influencerFilter]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEmailRefresh(fetchEmails);

  // Fetch influencer suggestions for the dropdown
  useEffect(() => {
    if (!influencerSearch.trim()) {
      setInfluencerOptions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/influencers?search=${encodeURIComponent(influencerSearch.trim())}&minimal=true&limit=10`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          const items = (data.influencers ?? []) as Array<{
            id: string;
            username: string;
          }>;
          setInfluencerOptions(
            items.map((i) => ({ id: i.id, username: i.username })),
          );
        }
      } catch {}
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [influencerSearch]);

  // Close influencer dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        influencerDropdownRef.current &&
        !influencerDropdownRef.current.contains(e.target as Node)
      ) {
        setShowInfluencerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleEmailClick = (emailId: string) => {
    // Save scroll position before navigating
    try {
      const viewport = scrollRef.current?.querySelector(
        "[data-slot=scroll-area-viewport]",
      );
      const current = sessionStorage.getItem(storageKey);
      const state = current ? JSON.parse(current) : {};
      state.scrollTop = viewport?.scrollTop ?? 0;
      state.selectedEmailId = emailId;
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
    router.push(`/email/${emailId}`);
  };

  const selectInfluencer = (option: InfluencerOption) => {
    setInfluencerFilter(option);
    setInfluencerSearch("");
    setShowInfluencerDropdown(false);
    setPage(1);
  };

  const clearInfluencerFilter = () => {
    setInfluencerFilter(null);
    setInfluencerSearch("");
    setPage(1);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-center justify-between">
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

        {/* Influencer filter */}
        <div className="flex items-center gap-2">
          {influencerFilter ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
              <User className="h-3 w-3" />
              @{influencerFilter.username}
              <button
                type="button"
                onClick={clearInfluencerFilter}
                className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800"
                title="Clear filter"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div ref={influencerDropdownRef} className="relative">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by influencer..."
                  className="h-7 w-52 text-xs"
                  value={influencerSearch}
                  onChange={(e) => {
                    setInfluencerSearch(e.target.value);
                    setShowInfluencerDropdown(true);
                  }}
                  onFocus={() => {
                    if (influencerSearch.trim()) setShowInfluencerDropdown(true);
                  }}
                />
              </div>
              {showInfluencerDropdown && influencerOptions.length > 0 && (
                <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover shadow-lg">
                  {influencerOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectInfluencer(option)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                    >
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate">@{option.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ScrollArea
        ref={scrollRef}
        className="*:data-[slot=scroll-area-viewport]:overscroll-contain min-h-0 flex-1"
      >
        {loading && emails.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Loading...
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Mail className="mb-3 h-10 w-10" />
            <p>
              {influencerFilter
                ? `No emails with @${influencerFilter.username}`
                : `No emails in ${title.toLowerCase()}`}
            </p>
            {influencerFilter && (
              <Button
                variant="link"
                size="sm"
                className="mt-2"
                onClick={clearInfluencerFilter}
              >
                Clear filter
              </Button>
            )}
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
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleEmailClick(email.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleEmailClick(email.id);
                  }}
                  className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 pr-20 text-left"
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectInfluencer(email.influencer!);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                          title={`Filter by @${email.influencer.username}`}
                        >
                          @{email.influencer.username}
                        </button>
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
                </div>

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
