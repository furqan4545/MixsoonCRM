"use client";

import UnderlineExtension from "@tiptap/extension-underline";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Trash2,
  Underline,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import ImageResize from "tiptap-extension-resize-image";
import { EmailAccountRequired } from "@/components/email-account-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SignatureResponse = {
  html?: string;
  error?: string;
};

export function EmailSignatureForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const [initialHtml, setInitialHtml] = useState<string | null>(null);
  const [editorHtml, setEditorHtml] = useState("<p></p>");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      UnderlineExtension,
      ImageResize.configure({
        minWidth: 80,
        maxWidth: 800,
      }),
    ],
    content: "<p></p>",
    onUpdate: ({ editor: nextEditor }) => {
      setEditorHtml(nextEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "min-h-[280px] w-full rounded-md border border-input bg-transparent px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-2 [&_p]:my-1",
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

  const loadSignature = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/signature", { cache: "no-store" });
      if (res.status === 404) {
        setNoAccount(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load signature");
      const data = (await res.json()) as SignatureResponse;
      setNoAccount(false);
      setInitialHtml(data.html ?? "<p></p>");
    } catch {
      toast.error("Failed to load signature");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSignature();
  }, [loadSignature]);

  useEffect(() => {
    if (!editor || initialHtml === null) return;
    editor.commands.setContent(initialHtml, false);
    setEditorHtml(editor.getHTML());
  }, [editor, initialHtml]);

  const handlePickImage = async (file: File | null) => {
    if (!editor || !file) return;
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) return;
    editor.chain().focus().setImage({ src: dataUrl, alt: "Signature" }).run();
    setEditorHtml(editor.getHTML());
  };

  const handleSave = async () => {
    const currentHtml = editor?.getHTML().trim() ?? editorHtml.trim();
    setSaving(true);
    try {
      const res = await fetch("/api/email/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: currentHtml,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SignatureResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to save signature");
      toast.success("Signature saved");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save signature",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete your saved signature?")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/email/signature", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete signature");
      editor?.commands.clearContent();
      setEditorHtml("<p></p>");
      setInitialHtml("<p></p>");
      toast.success("Signature deleted");
    } catch {
      toast.error("Failed to delete signature");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto h-full max-w-3xl p-6 text-sm text-muted-foreground">
        Loading signature...
      </div>
    );
  }

  if (noAccount) {
    return (
      <EmailAccountRequired
        title="Signature"
        message="Connect an email account first to manage signatures."
      />
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl space-y-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signature</h1>
        <p className="text-sm text-muted-foreground">
          Rich-text signature with formatting and resizable images.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            <Button
              type="button"
              variant={editor?.isActive("bold") ? "default" : "outline"}
              size="sm"
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold"
              disabled={!editor}
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={editor?.isActive("italic") ? "default" : "outline"}
              size="sm"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic"
              disabled={!editor}
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={editor?.isActive("underline") ? "default" : "outline"}
              size="sm"
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
              title="Underline"
              disabled={!editor}
            >
              <Underline className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={
                editor?.isActive("heading", { level: 1 })
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                if (!editor) return;
                if (editor.isActive("heading", { level: 1 })) {
                  editor.chain().focus().setParagraph().run();
                } else {
                  editor.chain().focus().toggleHeading({ level: 1 }).run();
                }
              }}
              title="Large"
              disabled={!editor}
            >
              <Heading1 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={
                editor?.isActive("heading", { level: 2 })
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                if (!editor) return;
                if (editor.isActive("heading", { level: 2 })) {
                  editor.chain().focus().setParagraph().run();
                } else {
                  editor.chain().focus().toggleHeading({ level: 2 }).run();
                }
              }}
              title="Medium"
              disabled={!editor}
            >
              <Heading2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={!editor}
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              Add Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handlePickImage(e.target.files?.[0] ?? null);
                e.currentTarget.value = "";
              }}
            />
            <span className="text-xs text-muted-foreground">
              Paste, drag-drop, or upload image. Drag corners to resize.
            </span>
          </div>

          <EditorContent 
            editor={editor} 
            className="w-full" 
          />

          <p className="text-xs text-muted-foreground">
            H1/H2 are toggle buttons. If both are off, text is normal.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || deleting}>
          {saving ? "Saving..." : "Save Signature"}
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={saving || deleting}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deleting ? "Deleting..." : "Delete Signature"}
        </Button>
      </div>

    </div>
  );
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

    const node = imageNodeType.create({ src: dataUrl, alt: "Signature" });
    const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
    view.dispatch(tr);
  }
}
