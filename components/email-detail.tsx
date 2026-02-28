"use client";

import {
  AlertTriangle,
  ArrowLeft,
  MailOpen,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/app/lib/date-utils";
import { plainTextToLinkedHtml } from "@/app/lib/email-rich-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmailData {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  folder: string;
  isRead: boolean;
  isStarred: boolean;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  messageId: string | null;
  influencer: { id: string; username: string; avatarUrl: string | null } | null;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    isImage: boolean;
    isVideo: boolean;
  }>;
}

interface Props {
  emailId: string;
}

export function EmailDetail({ emailId }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState<EmailData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/email/${emailId}`);
      if (res.ok) {
        setEmail(await res.json());
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

  const handleSpam = async () => {
    await fetch(`/api/email/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "SPAM" }),
    });
    toast.success("Marked as spam");
    router.back();
  };

  const handleReply = () => {
    if (!email) return;
    const params = new URLSearchParams({
      to: email.from,
      subject: email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`,
      inReplyTo: email.messageId ?? "",
    });
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
        <Button variant="ghost" size="icon" onClick={handleSpam} title="Spam">
          <AlertTriangle className="h-4 w-4" />
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
            </div>
          </div>

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
            ) : (
              <div
                className="whitespace-pre-wrap font-sans text-sm"
                dangerouslySetInnerHTML={{
                  __html: plainTextToLinkedHtml(email.bodyText ?? ""),
                }}
              />
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
