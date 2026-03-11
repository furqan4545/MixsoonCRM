"use client";

import { useRef, useCallback } from "react";
import Link from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageResize from "tiptap-extension-resize-image";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  PenTool,
  FileUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

/* ── Signature field custom node ── */
const SignatureFieldNode = Node.create({
  name: "signatureField",
  group: "block",
  atom: true,
  draggable: true,

  parseHTML() {
    return [{ tag: "div[data-signature-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-signature-field": "true",
        style:
          "border: 2px dashed #999; padding: 24px; text-align: center; margin: 16px 0; background: #f9f9f9; border-radius: 8px; color: #666; font-size: 14px; font-style: italic;",
      }),
      "[ SIGNATURE FIELD — Influencer will sign here ]",
    ];
  },

  addCommands() {
    return {
      insertSignatureField:
        () =>
        ({ commands }: { commands: { insertContent: (content: { type: string }) => boolean } }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});

/* ── Helpers (same as email-compose.tsx) ── */
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

/* ── Contract Editor ── */
interface ContractEditorProps {
  initialContent?: string;
  onContentChange: (html: string) => void;
}

export function ContractEditor({ initialContent, onContentChange }: ContractEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      UnderlineExtension,
      Link.configure({ autolink: true, openOnClick: false }),
      ImageResize.configure({ minWidth: 80, maxWidth: 800 }),
      SignatureFieldNode,
    ],
    content: initialContent || "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[400px] w-full rounded-b-md border border-t-0 border-input bg-white px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring prose prose-sm max-w-none [&_p]:my-1",
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
    onUpdate: ({ editor: e }) => {
      onContentChange(e.getHTML());
    },
  });

  const handleDocxUpload = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (!file.name.endsWith(".docx")) {
        toast.error("Only .docx files are supported");
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/contracts/convert-docx", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to convert");
        }
        const data = await res.json();
        editor.commands.setContent(data.html);
        if (data.warnings?.length > 0) {
          toast.info(`Imported with ${data.warnings.length} warning(s)`);
        } else {
          toast.success("Word document imported");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to import");
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  if (!editor) return null;

  const ToolbarBtn = ({
    onClick,
    active,
    disabled,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-input bg-muted/40 px-2 py-1.5">
        {/* Formatting */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Headings */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Lists */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Signature field */}
        <ToolbarBtn
          onClick={() => (editor.commands as unknown as { insertSignatureField: () => boolean }).insertSignatureField()}
          title="Insert Signature Field"
        >
          <PenTool className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Word upload */}
        <ToolbarBtn
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Import Word Document (.docx)"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
        </ToolbarBtn>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Hidden file input for .docx upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDocxUpload(file);
          e.target.value = "";
        }}
      />

      {/* Helper text */}
      <p className="text-[10px] text-muted-foreground mt-1">
        Drag & drop images into the editor. Use the pen icon to insert a signature field.
      </p>
    </div>
  );
}
