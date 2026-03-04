"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MailWarning,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────────

type AlertEvent = {
  id: string;
  ruleId: string;
  status: "ACTIVE" | "DISMISSED" | "RESOLVED";
  approvalId: string | null;
  emailId: string | null;
  influencerId: string | null;
  title: string;
  message: string | null;
  daysSince: number;
  dismissedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  rule: { type: string; thresholdDays: number };
};

type AlertRule = {
  id: string;
  type: string;
  thresholdDays: number;
  enabled: boolean;
  templateId: string | null;
  template: { id: string; name: string } | null;
  _count: { events: number };
};

type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  createdAt: string;
  updatedAt: string;
};

type FilterType = "ALL" | "APPROVAL_PENDING" | "EMAIL_NO_REPLY_INFLUENCER" | "EMAIL_NO_REPLY_US";

// ── Alert Type Labels & Icons ──────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  APPROVAL_PENDING: "Approval Pending",
  EMAIL_NO_REPLY_INFLUENCER: "No Reply (Influencer)",
  EMAIL_NO_REPLY_US: "No Reply (Us)",
};

const TYPE_DESCRIPTION: Record<string, string> = {
  APPROVAL_PENDING: "Alert when an approval request stays unreviewed",
  EMAIL_NO_REPLY_INFLUENCER: "Alert when an influencer hasn't replied to our email",
  EMAIL_NO_REPLY_US: "Alert when we haven't replied to an influencer's email",
};

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "APPROVAL_PENDING":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "EMAIL_NO_REPLY_INFLUENCER":
      return <MailWarning className="h-4 w-4 text-red-500" />;
    case "EMAIL_NO_REPLY_US":
      return <Send className="h-4 w-4 text-blue-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

// ── Template Variables ──────────────────────────────────────

const TEMPLATE_VARS = [
  { key: "influencer_name", label: "Influencer Name" },
  { key: "influencer_username", label: "Username" },
  { key: "influencer_email", label: "Influencer Email" },
  { key: "days_since_last_email", label: "Days Since Email" },
  { key: "our_email", label: "Our Email" },
];

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function AlertsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <h1 className="text-2xl font-bold tracking-tight">Alerts & Reminders</h1>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">Active Alerts</TabsTrigger>
          <TabsTrigger value="rules">Alert Rules</TabsTrigger>
          <TabsTrigger value="templates">Email Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <ActiveAlertsTab />
        </TabsContent>
        <TabsContent value="rules">
          <AlertRulesTab />
        </TabsContent>
        <TabsContent value="templates">
          <EmailTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1: ACTIVE ALERTS
// ═══════════════════════════════════════════════════════════

function ActiveAlertsTab() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<FilterType>("ALL");

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?status=ACTIVE");
      if (res.ok) setAlerts(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const runCheck = async () => {
    setChecking(true);
    try {
      await fetch("/api/alerts/check", { method: "POST" });
      await fetchAlerts();
    } catch {
      // silent
    } finally {
      setChecking(false);
    }
  };

  const dismissAlert = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (res.ok) setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const filtered = useMemo(
    () =>
      filter === "ALL"
        ? alerts
        : alerts.filter((a) => a.rule.type === filter),
    [alerts, filter],
  );

  const getSourceLink = (alert: AlertEvent) => {
    if (alert.approvalId) return `/approvals`;
    if (alert.emailId) return `/email`;
    return null;
  };

  const getFollowUpLink = (alert: AlertEvent) => {
    if (alert.rule.type === "EMAIL_NO_REPLY_INFLUENCER" || alert.rule.type === "EMAIL_NO_REPLY_US") {
      // Navigate to compose with influencer context
      if (alert.influencerId) {
        return `/email?compose=true&influencerId=${alert.influencerId}`;
      }
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["ALL", "APPROVAL_PENDING", "EMAIL_NO_REPLY_INFLUENCER", "EMAIL_NO_REPLY_US"] as FilterType[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "ALL" ? "All" : TYPE_LABEL[f]}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={runCheck} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Check Now
        </Button>
      </div>

      {/* Alert List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-12 w-12 mb-3 text-green-500/50" />
          <p className="text-lg font-medium">No active alerts</p>
          <p className="text-sm">Everything is up to date.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Alert</TableHead>
                <TableHead className="w-[100px]">Days</TableHead>
                <TableHead className="w-[100px]">Created</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((alert) => {
                const sourceLink = getSourceLink(alert);
                const followUpLink = getFollowUpLink(alert);
                return (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <TypeIcon type={alert.rule.type} />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{alert.title}</p>
                        {alert.message && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {alert.message}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {alert.daysSince}d overdue
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {sourceLink && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => window.open(sourceLink, "_blank")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {followUpLink && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2"
                            onClick={() => window.open(followUpLink, "_blank")}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          <BellOff className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2: ALERT RULES
// ═══════════════════════════════════════════════════════════

function AlertRulesTab() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/alerts/rules").then((r) => r.json()),
      fetch("/api/alerts/templates").then((r) => r.json()),
    ]).then(([r, t]) => {
      setRules(r);
      setTemplates(t);
      setLoading(false);
    });
  }, []);

  const updateRule = (id: string, field: string, value: unknown) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
    setDirty(true);
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/alerts/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: rules.map((r) => ({
            id: r.id,
            thresholdDays: r.thresholdDays,
            enabled: r.enabled,
            templateId: r.templateId,
          })),
        }),
      });
      if (res.ok) {
        setDirty(false);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Configure alert thresholds and enable/disable alert types
          </p>
        </div>
        <Button size="sm" onClick={saveRules} disabled={saving || !dirty}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Alert Type</TableHead>
              <TableHead className="w-[150px]">Threshold (days)</TableHead>
              <TableHead className="w-[200px]">Email Template</TableHead>
              <TableHead className="w-[100px]">Active Alerts</TableHead>
              <TableHead className="w-[80px]">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <TypeIcon type={rule.type} />
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">
                      {TYPE_LABEL[rule.type] ?? rule.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_DESCRIPTION[rule.type]}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    className="w-20 h-8"
                    value={rule.thresholdDays}
                    onChange={(e) =>
                      updateRule(
                        rule.id,
                        "thresholdDays",
                        parseInt(e.target.value) || 1,
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={rule.templateId ?? "none"}
                    onValueChange={(v) =>
                      updateRule(
                        rule.id,
                        "templateId",
                        v === "none" ? null : v,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {rule._count.events}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) =>
                      updateRule(rule.id, "enabled", v)
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 3: EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════

function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/templates");
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
      const res = await fetch(`/api/alerts/templates/${id}`, {
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
    <div className="space-y-4 mt-4">
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
        ? `/api/alerts/templates/${template.id}`
        : "/api/alerts/templates";
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
