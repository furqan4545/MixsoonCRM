"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PROVIDER_PRESETS: Record<
  string,
  { smtpHost: string; smtpPort: number; imapHost: string; imapPort: number }
> = {
  google: {
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    imapHost: "imap.gmail.com",
    imapPort: 993,
  },
  hiworks: {
    smtpHost: "smtp.hiworks.com",
    smtpPort: 587,
    imapHost: "imap.hiworks.com",
    imapPort: 993,
  },
};

export type EmailAccountData = {
  emailAddress: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
};

interface Props {
  existing?: {
    emailAddress: string;
    displayName: string | null;
    smtpHost: string;
    smtpPort: number;
    imapHost: string;
    imapPort: number;
    username: string;
  } | null;
}

export function EmailAccountForm({ existing }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    smtp: { ok: boolean; error?: string } | null;
    imap: { ok: boolean; error?: string } | null;
  }>({ smtp: null, imap: null });

  const [form, setForm] = useState<EmailAccountData>({
    emailAddress: existing?.emailAddress ?? "",
    displayName: existing?.displayName ?? "",
    smtpHost: existing?.smtpHost ?? "",
    smtpPort: existing?.smtpPort ?? 587,
    imapHost: existing?.imapHost ?? "",
    imapPort: existing?.imapPort ?? 993,
    username: existing?.username ?? "",
    password: "",
  });

  const update = (field: keyof EmailAccountData, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const applyPreset = (provider: string) => {
    const p = PROVIDER_PRESETS[provider];
    if (!p) return;
    setForm((prev) => ({ ...prev, ...p }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult({ smtp: null, imap: null });
    try {
      const res = await fetch("/api/email/account/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.smtp?.ok && data.imap?.ok) {
        toast.success("Connection test passed");
      } else {
        toast.error("Connection test failed — check settings");
      }
    } catch {
      toast.error("Test request failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.emailAddress || !form.username || !form.smtpHost || !form.imapHost) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!existing && !form.password) {
      toast.error("Password is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/email/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save");
      }
      toast.success("Email account saved");
      router.push("/email/inbox");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your email account? All synced emails will be removed.")) return;
    try {
      const res = await fetch("/api/email/account", { method: "DELETE" });
      if (res.ok) {
        toast.success("Account disconnected");
        router.refresh();
      }
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Account</h1>
        <p className="text-muted-foreground">
          Connect your email to send and receive messages within MIXSOON.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider Quick Setup</CardTitle>
          <CardDescription>
            Select your provider to auto-fill server settings, or configure
            manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => applyPreset("google")}>
            Google / Gmail
          </Button>
          <Button variant="outline" size="sm" onClick={() => applyPreset("hiworks")}>
            Hiworks
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emailAddress">Email Address *</Label>
              <Input
                id="emailAddress"
                placeholder="you@company.com"
                value={form.emailAddress}
                onChange={(e) => update("emailAddress", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Your Name"
                value={form.displayName}
                onChange={(e) => update("displayName", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                placeholder="you@company.com"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                Password {existing ? "(leave blank to keep current)" : "*"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtpHost">SMTP Host *</Label>
              <Input
                id="smtpHost"
                placeholder="smtp.gmail.com"
                value={form.smtpHost}
                onChange={(e) => update("smtpHost", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPort">SMTP Port</Label>
              <Input
                id="smtpPort"
                type="number"
                value={form.smtpPort}
                onChange={(e) => update("smtpPort", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imapHost">IMAP Host *</Label>
              <Input
                id="imapHost"
                placeholder="imap.gmail.com"
                value={form.imapHost}
                onChange={(e) => update("imapHost", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapPort">IMAP Port</Label>
              <Input
                id="imapPort"
                type="number"
                value={form.imapPort}
                onChange={(e) => update("imapPort", Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {(testResult.smtp || testResult.imap) && (
        <Card>
          <CardHeader>
            <CardTitle>Connection Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {testResult.smtp && (
              <div className="flex items-center gap-2">
                <span className={testResult.smtp.ok ? "text-green-600" : "text-red-600"}>
                  {testResult.smtp.ok ? "✓" : "✗"}
                </span>
                <span>
                  SMTP: {testResult.smtp.ok ? "Connected" : testResult.smtp.error}
                </span>
              </div>
            )}
            {testResult.imap && (
              <div className="flex items-center gap-2">
                <span className={testResult.imap.ok ? "text-green-600" : "text-red-600"}>
                  {testResult.imap.ok ? "✓" : "✗"}
                </span>
                <span>
                  IMAP: {testResult.imap.ok ? "Connected" : testResult.imap.error}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : existing ? "Update Account" : "Connect Account"}
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        {existing && (
          <Button variant="destructive" onClick={handleDisconnect} className="ml-auto">
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
