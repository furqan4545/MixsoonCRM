"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bold,
  FileText,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Trash2,
  Underline,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExt from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ContractTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  _count: { contracts: number };
}

const PLACEHOLDERS = [
  { key: "{{influencer_name}}", desc: "Influencer display name" },
  { key: "{{influencer_username}}", desc: "Influencer @username" },
  { key: "{{rate}}", desc: "Payment rate" },
  { key: "{{currency}}", desc: "Currency (USD, KRW, etc.)" },
  { key: "{{deliverables}}", desc: "Deliverables description" },
  { key: "{{start_date}}", desc: "Contract start date" },
  { key: "{{end_date}}", desc: "Contract end date" },
  { key: "{{campaign_name}}", desc: "Campaign name" },
  { key: "{{date}}", desc: "Current date" },
];

function TemplateEditor({
  initialName,
  initialContent,
  onSave,
  onCancel,
  saving,
}: {
  initialName: string;
  initialContent: string;
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initialName);

  const editor = useEditor({
    extensions: [StarterKit, UnderlineExt],
    content: initialContent || "<p>Start writing your contract template here...</p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none",
      },
    },
  });

  const insertPlaceholder = (placeholder: string) => {
    editor?.chain().focus().insertContent(placeholder).run();
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="templateName">Template Name</Label>
        <Input
          id="templateName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Standard Collaboration Agreement"
          className="mt-1.5"
        />
      </div>

      <div>
        <Label>Available Placeholders</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insertPlaceholder(p.key)}
              className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono hover:bg-accent transition-colors"
              title={p.desc}
            >
              {p.key}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border">
        {editor && (
          <div className="flex items-center gap-1 border-b border-border p-2">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("bold") && "bg-accent",
              )}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("italic") && "bg-accent",
              )}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("underline") && "bg-accent",
              )}
            >
              <Underline className="h-4 w-4" />
            </button>
            <div className="mx-1 h-6 w-px bg-border" />
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("bulletList") && "bg-accent",
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={cn(
                "rounded p-1.5 hover:bg-accent",
                editor.isActive("orderedList") && "bg-accent",
              )}
            >
              <ListOrdered className="h-4 w-4" />
            </button>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (!name.trim()) return;
            onSave(name.trim(), editor?.getHTML() || "");
          }}
          disabled={saving || !name.trim()}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Template
        </Button>
      </div>
    </div>
  );
}

export default function ContractTemplatesPage() {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSave = async (name: string, content: string) => {
    setSaving(true);
    try {
      if (editingTemplate) {
        await fetch(`/api/contracts/templates/${editingTemplate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content }),
        });
      } else {
        await fetch("/api/contracts/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content }),
        });
      }
      setEditingTemplate(null);
      setIsCreating(false);
      await fetchTemplates();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/contracts/templates/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    await fetchTemplates();
  };

  if (isCreating || editingTemplate) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold">
          {editingTemplate ? "Edit Template" : "New Contract Template"}
        </h1>
        <TemplateEditor
          initialName={editingTemplate?.name || ""}
          initialContent={editingTemplate?.content || ""}
          onSave={handleSave}
          onCancel={() => {
            setEditingTemplate(null);
            setIsCreating(false);
          }}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contract Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage contract templates with placeholder variables
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <div>
            <h2 className="text-lg font-semibold">No templates yet</h2>
            <p className="text-sm text-muted-foreground">
              Create your first contract template to get started.
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {t._count.contracts} contract{t._count.contracts !== 1 ? "s" : ""} created
                  {" · "}Updated {new Date(t.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTemplate(t)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this template? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
