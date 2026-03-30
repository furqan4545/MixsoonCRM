"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  RefreshCw,
  Send,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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

type EscalationLayer = {
  days: number;
  severity: string;
  notifyRole: string;
  action: string;
};

type AlertRule = {
  id: string;
  type: string;
  thresholdDays: number;
  enabled: boolean;
  templateId: string | null;
  template: { id: string; name: string } | null;
  severity: string;
  escalationLayers: EscalationLayer[];
  _count: { events: number };
};

type EmailTemplate = {
  id: string;
  name: string;
};

type FilterType = "ALL" | "APPROVAL_PENDING" | "EMAIL_NO_REPLY_INFLUENCER" | "EMAIL_NO_REPLY_US" | "CONTRACT_EXPIRING" | "CONTENT_OVERDUE" | "FOLLOW_UP_REMINDER";

// ── Alert Type Labels & Icons ──────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  APPROVAL_PENDING: "Approval Pending",
  EMAIL_NO_REPLY_INFLUENCER: "No Reply (Influencer)",
  EMAIL_NO_REPLY_US: "No Reply (Us)",
  CONTRACT_EXPIRING: "Contract Expiring",
  CONTENT_OVERDUE: "Content Overdue",
  FOLLOW_UP_REMINDER: "Follow-up Reminder",
};

const TYPE_DESCRIPTION: Record<string, string> = {
  APPROVAL_PENDING: "Alert when an approval request stays unreviewed",
  EMAIL_NO_REPLY_INFLUENCER: "Alert when an influencer hasn't replied to our email",
  EMAIL_NO_REPLY_US: "Alert when we haven't replied to an influencer's email",
  CONTRACT_EXPIRING: "Alert when a contract is about to expire",
  CONTENT_OVERDUE: "Alert when content submission hasn't been received",
  FOLLOW_UP_REMINDER: "General follow-up reminder for influencer interactions",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-blue-100 text-blue-700 border-blue-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
};

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "APPROVAL_PENDING":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "EMAIL_NO_REPLY_INFLUENCER":
      return <MailWarning className="h-4 w-4 text-red-500" />;
    case "EMAIL_NO_REPLY_US":
      return <Send className="h-4 w-4 text-blue-500" />;
    case "CONTRACT_EXPIRING":
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case "CONTENT_OVERDUE":
      return <Clock className="h-4 w-4 text-purple-500" />;
    case "FOLLOW_UP_REMINDER":
      return <Bell className="h-4 w-4 text-green-500" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

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
        </TabsList>

        <TabsContent value="active">
          <ActiveAlertsTab />
        </TabsContent>
        <TabsContent value="rules">
          <AlertRulesTab />
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
          {(["ALL", "APPROVAL_PENDING", "EMAIL_NO_REPLY_INFLUENCER", "EMAIL_NO_REPLY_US", "CONTRACT_EXPIRING", "CONTENT_OVERDUE", "FOLLOW_UP_REMINDER"] as FilterType[]).map((f) => (
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
      fetch("/api/email/templates").then((r) => r.json()),
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
            severity: r.severity,
            escalationLayers: r.escalationLayers,
          })),
        }),
      });
      if (res.ok) {
        // Reload rules from server to confirm what was actually saved
        const freshRes = await fetch("/api/alerts/rules");
        if (freshRes.ok) setRules(await freshRes.json());
        setDirty(false);
        toast.success("Alert rules saved");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error || "Failed to save rules");
      }
    } catch {
      toast.error("Failed to save rules");
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
              <TableHead className="w-[120px]">Threshold (days)</TableHead>
              <TableHead className="w-[120px]">Severity</TableHead>
              <TableHead className="w-[180px]">Email Template</TableHead>
              <TableHead className="w-[80px]">Escalation</TableHead>
              <TableHead className="w-[80px]">Active</TableHead>
              <TableHead className="w-[60px]">On</TableHead>
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
                    value={rule.severity}
                    onValueChange={(v) => updateRule(rule.id, "severity", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${SEVERITY_COLORS[s]}`}>
                            {s}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Badge variant="outline" className="text-[10px] cursor-pointer" onClick={() => {
                    const layers = [...(rule.escalationLayers || [])];
                    layers.push({
                      days: rule.thresholdDays * 2,
                      severity: "HIGH",
                      notifyRole: "ADMIN",
                      action: "email",
                    });
                    updateRule(rule.id, "escalationLayers", layers);
                  }}>
                    {(rule.escalationLayers?.length || 0)} layers +
                  </Badge>
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
