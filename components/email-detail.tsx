"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  Clock,
  Inbox,
  Reply,
  Send as SendIcon,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/app/lib/date-utils";
import { emitEmailRefresh } from "@/app/lib/email-events";
import { plainTextToLinkedHtml } from "@/app/lib/email-rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface EmailAlertInfo {
  id: string;
  emailMessageId: string;
  status: "WAITING" | "TRIGGERED" | "RESOLVED" | "CANCELLED";
  thresholdDays: number;
  triggerAt: string;
  triggeredAt: string | null;
  resolvedAt: string | null;
  followUpEmailId: string | null;
  template: { id: string; name: string } | null;
}

interface ThreadMessage {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  folder: string;
  isRead: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  messageId: string | null;
  influencer: { id: string; username: string; avatarUrl: string | null } | null;
}

interface EmailData extends ThreadMessage {
  isStarred: boolean;
  accountEmail?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    isImage: boolean;
    isVideo: boolean;
  }>;
  threadMessages?: ThreadMessage[];
  emailAlerts?: EmailAlertInfo[];
  pendingResponse?: {
    emailMessageId: string;
    from: string;
    subject: string;
    messageId: string | null;
    influencerId: string | null;
    daysSince: number;
  } | null;
}

interface Props {
  emailId: string;
}

function AlertBadge({
  alert,
  onRemove,
}: {
  alert: EmailAlertInfo;
  onRemove?: () => void;
}) {
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (new Date(alert.triggerAt).getTime() - Date.now()) / 86_400_000,
    ),
  );

  if (alert.status === "WAITING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
        <Clock className="h-3 w-3" />
        Follow-up in {daysLeft}d
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
            title="Remove alert"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </span>
    );
  }

  if (alert.status === "TRIGGERED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
        {alert.followUpEmailId ? (
          <>
            <SendIcon className="h-3 w-3" />
            Follow-up sent
          </>
        ) : (
          <>
            <Bell className="h-3 w-3" />
            Alert triggered
          </>
        )}
      </span>
    );
  }

  if (alert.status === "RESOLVED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" />
        Replied
      </span>
    );
  }

  return null;
}

function AddAlertDropdown({
  emailId,
  onAdded,
}: {
  emailId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAdd = async (days: number) => {
    setAdding(true);
    try {
      const res = await fetch(`/api/email/${emailId}/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdDays: days }),
      });
      if (res.ok) {
        toast.success(`Alert set for ${days} days`);
        onAdded();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Failed to add alert");
      }
    } catch {
      toast.error("Failed to add alert");
    } finally {
      setAdding(false);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={adding}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950/30"
      >
        <Bell className="h-3 w-3" />
        {adding ? "..." : "+ Alert"}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-32 rounded-md border bg-popover shadow-lg">
          {[3, 5, 7].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => handleAdd(days)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              {days} days
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  isCurrentEmail,
  accountEmail,
  alerts,
  pendingEmailId,
  onAlertChange,
}: {
  msg: ThreadMessage;
  isCurrentEmail: boolean;
  accountEmail?: string;
  alerts: EmailAlertInfo[];
  pendingEmailId?: string | null;
  onAlertChange: () => void;
}) {
  const date = msg.sentAt ?? msg.receivedAt ?? msg.createdAt;
  const isSent =
    msg.folder === "SENT" ||
    (accountEmail && msg.from.toLowerCase() === accountEmail.toLowerCase());

  // Get active alerts for this specific message
  const messageAlerts = alerts.filter((a) => a.emailMessageId === msg.id);
  const activeAlert = messageAlerts.find(
    (a) => a.status === "WAITING" || a.status === "TRIGGERED",
  );
  const resolvedAlert = messageAlerts.find((a) => a.status === "RESOLVED");
  const displayAlert = activeAlert || resolvedAlert;

  const handleRemoveAlert = async () => {
    try {
      const res = await fetch(`/api/email/${msg.id}/alert`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Alert removed");
        onAlertChange();
      } else {
        toast.error("Failed to remove alert");
      }
    } catch {
      toast.error("Failed to remove alert");
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 border p-4",
        isSent
          ? "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
        isCurrentEmail && "ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{msg.from}</span>
            {isSent ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                You sent
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                Received
              </span>
            )}
            {msg.influencer && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                @{msg.influencer.username}
              </Badge>
            )}
            {!isSent && pendingEmailId === msg.id && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                Pending reply
              </span>
            )}
          </div>
          <p className="text-muted-foreground">
            <span>To: </span>
            {msg.to.join(", ")}
          </p>
          {msg.cc.length > 0 && (
            <p className="text-muted-foreground">
              <span>CC: </span>
              {msg.cc.join(", ")}
            </p>
          )}
          {/* Alert badges for sent messages */}
          {isSent && (
            <div className="flex items-center gap-1.5 pt-0.5">
              {displayAlert ? (
                <AlertBadge
                  alert={displayAlert}
                  onRemove={
                    displayAlert.status === "WAITING"
                      ? handleRemoveAlert
                      : undefined
                  }
                />
              ) : (
                <AddAlertDropdown
                  emailId={msg.id}
                  onAdded={onAlertChange}
                />
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {date ? formatDistanceToNow(new Date(date)) : ""}
        </span>
      </div>

      <div className="prose prose-sm mt-3 max-w-none dark:prose-invert">
        {msg.bodyHtml ? (
          <div dangerouslySetInnerHTML={{ __html: msg.bodyHtml }} />
        ) : msg.bodyText ? (
          <div
            className="whitespace-pre-wrap font-sans text-sm"
            dangerouslySetInnerHTML={{
              __html: plainTextToLinkedHtml(msg.bodyText),
            }}
          />
        ) : (
          <p className="text-sm italic text-muted-foreground">
            (no message content)
          </p>
        )}
      </div>
    </div>
  );
}

export function EmailDetail({ emailId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [clearingPending, setClearingPending] = useState(false);
  const replyBoxRef = useRef<HTMLTextAreaElement | null>(null);
  const hasFetched = useRef(false);

  const fetchEmail = useCallback(async () => {
    if (!hasFetched.current) setLoading(true);
    try {
      const res = await fetch(`/api/email/${emailId}`);
      if (res.ok) {
        setEmail(await res.json());
        hasFetched.current = true;
      } else {
        toast.error("Email not found");
        router.push("/email/inbox");
      }
    } catch {
      toast.error("Failed to load email");
    } finally {
      setLoading(false);
    }
  }, [emailId, router]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  const handleStar = async () => {
    if (!email) return;
    const res = await fetch(`/api/email/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isStarred: !email.isStarred }),
    });
    if (res.ok) setEmail((e) => (e ? { ...e, isStarred: !e.isStarred } : e));
  };

  const handleDelete = async () => {
    await fetch(`/api/email/${emailId}`, { method: "DELETE" });
    toast.success(
      email?.folder === "TRASH" ? "Permanently deleted" : "Moved to trash",
    );
    router.back();
  };

  const handleSpamToggle = async () => {
    const isSpam = email?.folder === "SPAM";
    const newFolder = isSpam ? "INBOX" : "SPAM";
    await fetch(`/api/email/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: newFolder }),
    });
    toast.success(isSpam ? "Moved to inbox" : "Marked as spam");
    emitEmailRefresh();
    router.back();
  };

  const handleReply = () => {
    if (!email) return;
    if (email.pendingResponse) {
      replyBoxRef.current?.focus();
      replyBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const params = new URLSearchParams({
      to: email.from,
      subject: email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`,
      inReplyTo: email.messageId ?? "",
    });
    // Carry influencer link forward to reply
    if (email.influencer?.id) {
      params.set("influencerId", email.influencer.id);
    }
    router.push(`/email/compose?${params}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!email) return null;

  const date = email.sentAt ?? email.receivedAt ?? email.createdAt;
  const emailAlerts = email.emailAlerts ?? [];
  const pendingResponse = email.pendingResponse ?? null;
  const pendingReplySubject = pendingResponse
    ? pendingResponse.subject.startsWith("Re:")
      ? pendingResponse.subject
      : `Re: ${pendingResponse.subject}`
    : "";

  // Build thread: combine thread messages + current email, sorted chronologically
  // When viewing from SPAM or TRASH, only show messages in the same folder
  const rawThreadMessages = email.threadMessages ?? [];
  const isSpecialFolder = email.folder === "SPAM" || email.folder === "TRASH";
  const threadMessages = isSpecialFolder
    ? rawThreadMessages.filter((m) => m.folder === email.folder)
    : rawThreadMessages;
  const allMessages: ThreadMessage[] = [...threadMessages, email].sort(
    (a, b) => {
      const dateA = new Date(
        a.sentAt ?? a.receivedAt ?? a.createdAt,
      ).getTime();
      const dateB = new Date(
        b.sentAt ?? b.receivedAt ?? b.createdAt,
      ).getTime();
      return dateA - dateB;
    },
  );
  const hasThread = threadMessages.length > 0;

  const handleClearPending = async () => {
    if (!pendingResponse) return;
    setClearingPending(true);
    try {
      const res = await fetch(`/api/email/${pendingResponse.emailMessageId}/pending`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to clear pending reply");
      }
      toast.success("Pending reply cleared");
      await fetchEmail();
      emitEmailRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clear pending reply",
      );
    } finally {
      setClearingPending(false);
    }
  };

  const handleInlineReply = async () => {
    if (!pendingResponse) return;
    const trimmedBody = replyBody.trim();
    if (!trimmedBody) {
      toast.error("Write a reply first");
      return;
    }

    setSendingReply(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [pendingResponse.from],
          subject: pendingReplySubject,
          bodyText: trimmedBody,
          bodyHtml: textToHtml(trimmedBody),
          influencerId: pendingResponse.influencerId ?? "",
          inReplyTo: pendingResponse.messageId ?? "",
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to send reply");
      }

      setReplyBody("");
      toast.success("Reply sent");
      await fetchEmail();
      emitEmailRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={handleReply} title="Reply">
          <Reply className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleStar} title="Star">
          <Star
            className={`h-4 w-4 ${email.isStarred ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSpamToggle}
          title={email.folder === "SPAM" ? "Not spam – move to inbox" : "Mark as spam"}
        >
          {email.folder === "SPAM" ? (
            <Inbox className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="*:data-[slot=scroll-area-viewport]:overscroll-contain min-h-0 flex-1">
        <div className="space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold">
              {email.subject || "(no subject)"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {email.folder}
              </Badge>
              {email.influencer && (
                <Badge variant="secondary" className="text-xs">
                  @{email.influencer.username}
                </Badge>
              )}
              {pendingResponse && (
                <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-200">
                  Pending reply
                </Badge>
              )}
              {hasThread && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {allMessages.length} messages in thread
                </Badge>
              )}
            </div>
          </div>

          {/* Thread: show all messages in chronological order */}
          {hasThread ? (
            <div className="space-y-3">
              {allMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isCurrentEmail={msg.id === email.id}
                  accountEmail={email.accountEmail}
                  alerts={emailAlerts}
                  pendingEmailId={pendingResponse?.emailMessageId}
                  onAlertChange={fetchEmail}
                />
              ))}
            </div>
          ) : (
            <>
              {/* Single email view (no thread) */}
              <div className="flex items-start justify-between rounded-lg border p-4">
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="text-muted-foreground">From: </span>
                    <span className="font-medium">{email.from}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">To: </span>
                    {email.to.join(", ")}
                  </p>
                  {email.cc.length > 0 && (
                    <p>
                      <span className="text-muted-foreground">CC: </span>
                      {email.cc.join(", ")}
                    </p>
                  )}
                  {pendingResponse?.emailMessageId === email.id && (
                    <div className="pt-1">
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        Pending reply
                      </span>
                    </div>
                  )}
                  {/* Alert badge for single sent email view */}
                  {(email.folder === "SENT" || (email.accountEmail && email.from.toLowerCase() === email.accountEmail.toLowerCase())) && (
                    <div className="flex items-center gap-1.5 pt-1">
                      {emailAlerts.filter(
                        (a) =>
                          a.emailMessageId === email.id &&
                          (a.status === "WAITING" || a.status === "TRIGGERED" || a.status === "RESOLVED"),
                      ).length > 0 ? (
                        emailAlerts
                          .filter(
                            (a) =>
                              a.emailMessageId === email.id &&
                              (a.status === "WAITING" || a.status === "TRIGGERED" || a.status === "RESOLVED"),
                          )
                          .slice(0, 1)
                          .map((alert) => (
                            <AlertBadge
                              key={alert.id}
                              alert={alert}
                              onRemove={
                                alert.status === "WAITING"
                                  ? async () => {
                                      try {
                                        const res = await fetch(
                                          `/api/email/${email.id}/alert`,
                                          { method: "DELETE" },
                                        );
                                        if (res.ok) {
                                          toast.success("Alert removed");
                                          fetchEmail();
                                        }
                                      } catch {
                                        toast.error("Failed to remove alert");
                                      }
                                    }
                                  : undefined
                              }
                            />
                          ))
                      ) : (
                        <AddAlertDropdown
                          emailId={email.id}
                          onAdded={fetchEmail}
                        />
                      )}
                    </div>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {date ? formatDistanceToNow(new Date(date)) : ""}
                </span>
              </div>

              <div className="prose prose-sm max-w-none dark:prose-invert">
                {(email.attachments?.length ?? 0) > 0 && (
                  <div className="mb-4 rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">Attachments</p>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {email.attachments?.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="overflow-hidden rounded-md border bg-muted/30 hover:bg-muted/50"
                        >
                          {attachment.isImage ? (
                            <img
                              src={attachment.url}
                              alt={attachment.filename}
                              className="h-28 w-full object-cover"
                            />
                          ) : attachment.isVideo ? (
                            <video
                              src={attachment.url}
                              className="h-28 w-full object-cover"
                              controls
                            />
                          ) : (
                            <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                              Open file
                            </div>
                          )}
                          <div className="truncate border-t px-2 py-1 text-xs">
                            {attachment.filename}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {email.bodyHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: email.bodyHtml }} />
                ) : email.bodyText ? (
                  <div
                    className="whitespace-pre-wrap font-sans text-sm"
                    dangerouslySetInnerHTML={{
                      __html: plainTextToLinkedHtml(email.bodyText),
                    }}
                  />
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    (no message content)
                  </p>
                )}
              </div>
            </>
          )}

          {pendingResponse && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-medium">Pending reply</p>
                    <Badge variant="outline" className="text-[10px]">
                      {pendingResponse.daysSince}d waiting
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This thread is still waiting for your reply. Sending a reply
                    removes it from `Pending` automatically.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearPending}
                  disabled={clearingPending}
                >
                  {clearingPending ? "Clearing..." : "Clear pending"}
                </Button>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Reply to {pendingResponse.from}
                </p>
                <Textarea
                  ref={replyBoxRef}
                  rows={6}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Write your reply here..."
                  className="bg-background"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Subject: {pendingReplySubject}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams({
                          to: pendingResponse.from,
                          subject: pendingReplySubject,
                          inReplyTo: pendingResponse.messageId ?? "",
                        });
                        if (pendingResponse.influencerId) {
                          params.set("influencerId", pendingResponse.influencerId);
                        }
                        router.push(`/email/compose?${params}`);
                      }}
                    >
                      Open full composer
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleInlineReply}
                      disabled={sendingReply || !replyBody.trim()}
                    >
                      {sendingReply ? "Sending..." : "Send reply"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function textToHtml(text: string) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
