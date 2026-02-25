"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Send, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { emitEmailRefresh } from "@/app/lib/email-events";

interface Props {
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  influencerId?: string;
  inReplyTo?: string;
  draftId?: string;
}

export function EmailCompose({
  defaultTo,
  defaultSubject,
  defaultBody,
  influencerId,
  inReplyTo,
  draftId,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [to, setTo] = useState(defaultTo ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState(defaultBody ?? "");
  const [showCc, setShowCc] = useState(false);

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error("Recipient is required");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }

    setSending(true);
    try {
      const recipients = to
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const ccList = cc
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipients,
          cc: ccList.length > 0 ? ccList : undefined,
          subject,
          bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(body)}</div>`,
          bodyText: body,
          influencerId: influencerId || undefined,
          inReplyTo: inReplyTo || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send");
      }

      if (draftId) {
        await fetch(`/api/email/${draftId}`, { method: "DELETE" });
      }

      toast.success("Email sent");
      emitEmailRefresh();
      router.push("/email/sent");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const recipients = to
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      if (draftId) {
        await fetch("/api/email/drafts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId,
            to: recipients,
            subject,
            bodyText: body,
            bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(body)}</div>`,
          }),
        });
      } else {
        await fetch("/api/email/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipients,
            subject,
            bodyText: body,
            bodyHtml: `<div style="white-space:pre-wrap">${escapeHtml(body)}</div>`,
            influencerId: influencerId || undefined,
          }),
        });
      }
      toast.success("Draft saved");
      emitEmailRefresh();
    } catch {
      toast.error("Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">New Email</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={savingDraft}
          >
            <Save className="mr-1 h-4 w-4" />
            {savingDraft ? "Saving..." : "Save Draft"}
          </Button>
          <Button size="sm" onClick={handleSend} disabled={sending}>
            <Send className="mr-1 h-4 w-4" />
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Label className="w-12 shrink-0 text-right text-sm text-muted-foreground">
            To
          </Label>
          <Input
            placeholder="recipient@example.com (comma-separated)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8"
          />
          {!showCc && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs"
              onClick={() => setShowCc(true)}
            >
              CC
            </Button>
          )}
        </div>
        {showCc && (
          <div className="flex items-center gap-3">
            <Label className="w-12 shrink-0 text-right text-sm text-muted-foreground">
              CC
            </Label>
            <Input
              placeholder="cc@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="h-8"
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Label className="w-12 shrink-0 text-right text-sm text-muted-foreground">
            Subject
          </Label>
          <Input
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8"
          />
        </div>
      </div>

      <div className="flex-1 p-4">
        <Textarea
          placeholder="Write your message..."
          className="h-full min-h-[300px] resize-none border-0 p-0 shadow-none focus-visible:ring-0"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
