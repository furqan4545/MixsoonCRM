"use client";

import Link from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Film,
  Italic,
  Paperclip,
  Save,
  Send,
  Sparkles,
  Underline,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ImageResize from "tiptap-extension-resize-image";
import { emitEmailRefresh } from "@/app/lib/email-events";
import { plainTextToLinkedHtml } from "@/app/lib/email-rich-text";
import { signatureToHtml } from "@/app/lib/email-signature";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  influencerId?: string;
  inReplyTo?: string;
  draftId?: string;
  accountSignature?: string;
}

const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const URL_REGEX = /((https?:\/\/|www\.)[^\s<]+)/gi;

type ComposeAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

export function EmailCompose({
  defaultTo,
  defaultSubject,
  defaultBody,
  influencerId,
  inReplyTo,
  draftId,
  accountSignature,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const ccInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ComposeAttachment[]>([]);

  const [to, setTo] = useState<string[]>(() => parseRecipients(defaultTo));
  const [cc, setCc] = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [showCc, setShowCc] = useState(false);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const initialEditorHtml = useMemo(
    () => buildInitialComposeHtml(defaultBody, accountSignature),
    [defaultBody, accountSignature],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      UnderlineExtension,
      Link.configure({
        autolink: true,
        openOnClick: false,
      }),
      ImageResize.configure({
        minWidth: 80,
        maxWidth: 800,
      }),
    ],
    content: initialEditorHtml || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[300px] w-full rounded-md border border-input bg-transparent px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring prose prose-sm max-w-none dark:prose-invert [&_p]:my-1",
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith("image/"),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        void insertFilesAtView(view, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter(
          (file) => file.type.startsWith("image/"),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        const point = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (point) {
          const selection = TextSelection.create(view.state.doc, point.pos);
          view.dispatch(view.state.tr.setSelection(selection));
        }
        void insertFilesAtView(view, files);
        return true;
      },
    },
  });

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (!previewImageUrl) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImageUrl(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImageUrl]);

  useEffect(() => {
    if (!editor || !initialEditorHtml) return;
    if (editor.isEmpty) {
      editor.commands.setContent(initialEditorHtml, false);
    }
  }, [editor, initialEditorHtml]);

  useEffect(() => {
    return () => {
      for (const item of attachmentsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const totalAttachmentBytes = useMemo(
    () => attachments.reduce((sum, item) => sum + item.file.size, 0),
    [attachments],
  );

  const addRecipients = (
    values: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) => {
      const existing = new Set(prev.map((email) => email.toLowerCase()));
      const next = [...prev];
      for (const value of values) {
        const normalized = normalizeRecipient(value);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        next.push(normalized);
      }
      return next;
    });
  };

  const handleRecipientCommit = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    addRecipients(splitRecipientInput(value), setter);
    inputSetter("");
  };

  const handleAddAttachments = (files: File[]) => {
    if (files.length === 0) return;

    const mediaFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    const skippedCount = files.length - mediaFiles.length;
    if (skippedCount > 0) {
      toast.error("Only image and video attachments are supported");
    }
    if (mediaFiles.length === 0) return;

    const nextTotal =
      totalAttachmentBytes +
      mediaFiles.reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
      toast.error("Attachments exceed 20 MB total limit");
      return;
    }

    const nextItems = mediaFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
      isImage: file.type.startsWith("image/"),
    }));

    setAttachments((prev) => [...prev, ...nextItems]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const getEditorPayload = () => {
    if (!editor) return { bodyHtml: "", bodyText: "" };

    const bodyHtml = editor.getHTML();
    const bodyText = editor.getText();
    return { bodyHtml, bodyText };
  };

  const handleSend = async () => {
    const toList = [...to];
    if (toInput.trim()) {
      toList.push(...splitRecipientInput(toInput));
      setTo(uniqueRecipients(toList));
      setToInput("");
    }

    const ccList = [...cc];
    if (ccInput.trim()) {
      ccList.push(...splitRecipientInput(ccInput));
      setCc(uniqueRecipients(ccList));
      setCcInput("");
    }

    const finalTo = uniqueRecipients(toList);
    const finalCc = uniqueRecipients(ccList);

    if (finalTo.length === 0) {
      toast.error("Recipient is required");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }

    const { bodyHtml, bodyText } = getEditorPayload();

    setSending(true);
    try {
      const formData = new FormData();
      finalTo.forEach((email) => formData.append("to", email));
      finalCc.forEach((email) => formData.append("cc", email));
      formData.append("subject", subject);
      formData.append("bodyHtml", bodyHtml);
      formData.append("bodyText", bodyText);
      if (influencerId) formData.append("influencerId", influencerId);
      if (inReplyTo) formData.append("inReplyTo", inReplyTo);
      attachments.forEach((item) =>
        formData.append("attachments", item.file, item.file.name),
      );

      const res = await fetch("/api/email/send", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await safeJson(res);
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
      const recipients = uniqueRecipients([
        ...to,
        ...splitRecipientInput(toInput),
      ]);
      const ccList = uniqueRecipients([...cc, ...splitRecipientInput(ccInput)]);
      const { bodyHtml, bodyText } = getEditorPayload();

      if (draftId) {
        await fetch("/api/email/drafts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draftId,
            to: recipients,
            cc: ccList,
            subject,
            bodyText,
            bodyHtml,
          }),
        });
      } else {
        await fetch("/api/email/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipients,
            cc: ccList,
            subject,
            bodyText,
            bodyHtml,
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

  const handleGenerateAiDraft = async () => {
    const recipients = uniqueRecipients([
      ...to,
      ...splitRecipientInput(toInput),
    ]);
    if (!influencerId && recipients.length === 0) {
      toast.error("Open compose from an influencer or add a recipient first");
      return;
    }

    setGeneratingAi(true);
    try {
      const res = await fetch("/api/email/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencerId: influencerId || undefined,
          to: recipients,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        subject?: string;
        bodyText?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate AI draft");
      }

      const nextSubject = (data.subject ?? "").trim();
      const nextBody = (data.bodyText ?? "").trim();
      if (!nextBody) {
        throw new Error("AI draft body is empty");
      }

      if (nextSubject) {
        setSubject(nextSubject);
      }
      if (editor) {
        editor.commands.setContent(
          buildInitialComposeHtml(nextBody, accountSignature),
          false,
        );
        editor.commands.focus();
      }
      toast.success("AI outreach draft inserted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI draft failed");
    } finally {
      setGeneratingAi(false);
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
            className="px-2.5"
            onClick={handleGenerateAiDraft}
            disabled={generatingAi}
            aria-label="Generate AI outreach draft"
            title="Generate AI outreach draft"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
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
          <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1 rounded-md border px-2 py-1">
            {to.map((email) => (
              <RecipientChip
                key={email}
                value={email}
                onRemove={() =>
                  setTo((prev) => prev.filter((x) => x !== email))
                }
                onEdit={() => {
                  setTo((prev) => prev.filter((x) => x !== email));
                  setToInput(email);
                  requestAnimationFrame(() => toInputRef.current?.focus());
                }}
              />
            ))}
            <input
              ref={toInputRef}
              placeholder={to.length > 0 ? "" : "recipient@example.com"}
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              onBlur={() => handleRecipientCommit(toInput, setTo, setToInput)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" ||
                  e.key === "Tab" ||
                  e.key === "," ||
                  e.key === " "
                ) {
                  e.preventDefault();
                  handleRecipientCommit(toInput, setTo, setToInput);
                } else if (e.key === "Backspace" && !toInput && to.length > 0) {
                  e.preventDefault();
                  setTo((prev) => prev.slice(0, -1));
                }
              }}
              className="h-6 min-w-[180px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
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
            <div className="flex min-h-8 flex-1 flex-wrap items-center gap-1 rounded-md border px-2 py-1">
              {cc.map((email) => (
                <RecipientChip
                  key={email}
                  value={email}
                  onRemove={() =>
                    setCc((prev) => prev.filter((x) => x !== email))
                  }
                  onEdit={() => {
                    setCc((prev) => prev.filter((x) => x !== email));
                    setCcInput(email);
                    requestAnimationFrame(() => ccInputRef.current?.focus());
                  }}
                />
              ))}
              <input
                ref={ccInputRef}
                placeholder={cc.length > 0 ? "" : "cc@example.com"}
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onBlur={() => handleRecipientCommit(ccInput, setCc, setCcInput)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" ||
                    e.key === "Tab" ||
                    e.key === "," ||
                    e.key === " "
                  ) {
                    e.preventDefault();
                    handleRecipientCommit(ccInput, setCc, setCcInput);
                  } else if (
                    e.key === "Backspace" &&
                    !ccInput &&
                    cc.length > 0
                  ) {
                    e.preventDefault();
                    setCc((prev) => prev.slice(0, -1));
                  }
                }}
                className="h-6 min-w-[180px] flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Label className="w-12 shrink-0 text-right text-sm text-muted-foreground">
            Subject
          </Label>
          <input
            placeholder="Email subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 w-full rounded-md border px-3 text-sm"
          />
        </div>
        <div className="flex items-start gap-3">
          <Label className="mt-1 w-12 shrink-0 text-right text-sm text-muted-foreground">
            Files
          </Label>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => attachmentInputRef.current?.click()}
              >
                <Paperclip className="mr-1 h-4 w-4" />
                Attach Media
              </Button>
              <span className="text-xs text-muted-foreground">
                {formatBytes(totalAttachmentBytes)} /{" "}
                {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}
              </span>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  handleAddAttachments(Array.from(e.target.files ?? []));
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((item) => (
                  <div
                    key={item.id}
                    className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted text-left"
                  >
                    {item.isImage && item.previewUrl ? (
                      <button
                        type="button"
                        className="h-full w-full"
                        onClick={() => setPreviewImageUrl(item.previewUrl)}
                        aria-label={`Preview ${item.file.name}`}
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
                        <Film className="h-4 w-4" />
                        <span className="line-clamp-2 text-center text-[10px]">
                          {item.file.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/75"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(item.id);
                      }}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b pb-2 mb-2">
          <Button
            type="button"
            variant={editor?.isActive("bold") ? "default" : "outline"}
            size="sm"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold"
            disabled={!editor || generatingAi}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={editor?.isActive("italic") ? "default" : "outline"}
            size="sm"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic"
            disabled={!editor || generatingAi}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={editor?.isActive("underline") ? "default" : "outline"}
            size="sm"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            title="Underline"
            disabled={!editor || generatingAi}
          >
            <Underline className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 min-h-[300px]">
          <EditorContent
            editor={editor}
            className="w-full h-full"
            aria-busy={generatingAi}
          />
          {generatingAi && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-md border bg-background/95 p-3">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                AI is drafting outreach...
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-10/12" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-8/12" />
              </div>
            </div>
          )}
        </div>
      </div>

      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative w-full max-w-[900px] rounded-lg bg-background p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded bg-black/70 p-1 text-white hover:bg-black/85"
              onClick={() => setPreviewImageUrl(null)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewImageUrl}
              alt="Attachment preview"
              className="mx-auto max-h-[70vh] w-auto max-w-full rounded-md object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function buildInitialComposeHtml(
  bodyText?: string,
  signatureText?: string,
): string {
  const normalizedBody = (bodyText ?? "").trim();

  const bodyHtml = normalizedBody ? plainTextToLinkedHtml(normalizedBody) : "";
  const signatureHtml = signatureToHtml(signatureText);

  const spacer = "<div><br></div><div><br></div><div><br></div><div><br></div>";

  if (bodyHtml && signatureHtml) {
    return `${bodyHtml}${spacer}${signatureHtml}`;
  }
  if (bodyHtml) return bodyHtml;
  if (signatureHtml) return `${spacer}${signatureHtml}`;
  return "<div><br></div>";
}

async function fileToDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > 2 * 1024 * 1024) {
    toast.error("Image must be under 2 MB");
    return null;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  }).catch(() => {
    toast.error("Failed to read image");
    return null;
  });
}

async function insertFilesAtView(
  view: {
    state: {
      schema: {
        nodes: Record<
          string,
          { create: (attrs: Record<string, unknown>) => unknown }
        >;
      };
      tr: {
        replaceSelectionWith: (node: unknown) => {
          scrollIntoView: () => unknown;
        };
      };
    };
    dispatch: (tr: unknown) => void;
  },
  files: File[],
) {
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) continue;

    const imageNodeType =
      view.state.schema.nodes.imageResize ?? view.state.schema.nodes.image;
    if (!imageNodeType) continue;

    const node = imageNodeType.create({ src: dataUrl, alt: "Pasted image" });
    const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
    view.dispatch(tr);
  }
}

function RecipientChip({
  value,
  onRemove,
  onEdit,
}: {
  value: string;
  onRemove: () => void;
  onEdit: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
      <button
        type="button"
        onClick={onEdit}
        className="max-w-[240px] truncate text-left hover:text-foreground"
        title="Click to edit recipient"
      >
        {value}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
        aria-label={`Remove ${value}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function normalizeRecipient(value: string): string {
  return value.trim().replace(/[;,]+$/g, "");
}

function splitRecipientInput(value: string): string[] {
  return value
    .split(/[,\n;\s]+/)
    .map(normalizeRecipient)
    .filter(Boolean);
}

function parseRecipients(value?: string): string[] {
  if (!value) return [];
  return uniqueRecipients(splitRecipientInput(value));
}

function uniqueRecipients(values: string[]): string[] {
  const existing = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    out.push(value);
  }
  return out;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function safeJson(res: Response): Promise<{ error?: string }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}
