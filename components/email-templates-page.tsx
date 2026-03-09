"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────────

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
};

// ── Template Variables ──────────────────────────────────────

const TEMPLATE_VARS = [
  { key: "influencer_name", label: "Influencer Name" },
  { key: "influencer_username", label: "Username" },
  { key: "influencer_email", label: "Influencer Email" },
  { key: "days_since_last_email", label: "Days Since Email" },
  { key: "our_email", label: "Our Email" },
];

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/email/templates");
      if (res.ok) setTemplates(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/email/templates/${id}`, {
        method: "DELETE",
      });
      if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // silent
    }
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    setDialogOpen(false);
    fetchTemplates();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Mail className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Email Templates</h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Create reusable email templates for follow-up reminders. Use{" "}
            <code className="text-xs bg-muted px-1 rounded">
              {"{{variable_name}}"}
            </code>{" "}
            for dynamic content.
          </p>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Mail className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">No templates yet</p>
            <p className="text-sm">Create your first follow-up email template.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-[120px]">Updated</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.subject}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-red-500 hover:text-red-600"
                          onClick={() => deleteTemplate(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <TemplateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          template={editing}
          onSaved={handleSaved}
        />
      </div>
    </div>
  );
}

// ── Template Dialog ────────────────────────────────────────

function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: EmailTemplate | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      setBodyHtml(template.bodyHtml);
    } else {
      setName("");
      setSubject("");
      setBodyHtml("");
    }
  }, [template, open]);

  const insertVar = (key: string) => {
    setBodyHtml((prev) => prev + `{{${key}}}`);
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) return;
    setSaving(true);
    try {
      const url = template
        ? `/api/email/templates/${template.id}`
        : "/api/email/templates";
      const method = template ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          bodyHtml: bodyHtml.trim(),
        }),
      });

      if (res.ok) {
        onSaved();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? "Edit Template" : "New Email Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template Name</Label>
            <Input
              placeholder="e.g. Follow-up Reminder"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Subject Line</Label>
            <Input
              placeholder="e.g. Following up on our collaboration"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Email Body (HTML)</Label>
              <div className="flex gap-1 flex-wrap">
                {TEMPLATE_VARS.map((v) => (
                  <Button
                    key={v.key}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => insertVar(v.key)}
                  >
                    {v.label}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              rows={10}
              placeholder="Write your email template here. Use {{influencer_name}} for variables..."
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !subject.trim() || !bodyHtml.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
