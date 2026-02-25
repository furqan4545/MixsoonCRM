"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Provider = "google" | "hiworks";

const PROVIDERS: Record<
  Provider,
  {
    label: string;
    smtpHost: string;
    smtpPort: number;
    imapHost: string;
    imapPort: number;
    placeholder: string;
    note: string;
  }
> = {
  google: {
    label: "Gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    placeholder: "you@gmail.com",
    note: "Requires an App Password if 2FA is enabled. Go to Google Account → Security → App Passwords.",
  },
  hiworks: {
    label: "Hiworks",
    smtpHost: "smtps.hiworks.com",
    smtpPort: 465,
    imapHost: "pop3s.hiworks.com",
    imapPort: 995,
    placeholder: "you@company.hiworks.com",
    note: "Enable POP3/SMTP in Hiworks settings first and use a dedicated mail-client password. Receive sync uses POP3 inbox only.",
  },
};

function detectProvider(smtpHost: string): Provider | null {
  if (smtpHost.includes("gmail")) return "google";
  if (smtpHost.includes("hiworks")) return "hiworks";
  return null;
}

export type EmailAccountData = {
  emailAddress: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  password: string;
};

interface Props {
  existing?: {
    emailAddress: string;
    smtpHost: string;
    smtpPort: number;
    imapHost: string;
    imapPort: number;
  } | null;
}

export function EmailAccountForm({ existing }: Props) {
  const router = useRouter();
  const isConnected = !!existing;
  const lockedProvider = existing ? detectProvider(existing.smtpHost) : null;

  const [provider, setProvider] = useState<Provider>(
    lockedProvider ?? "google",
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    smtp: { ok: boolean; error?: string } | null;
    imap: { ok: boolean; error?: string } | null;
  }>({ smtp: null, imap: null });

  const [email, setEmail] = useState(existing?.emailAddress ?? "");
  const [password, setPassword] = useState("");

  const preset = PROVIDERS[provider];

  const buildPayload = () => ({
    emailAddress: email,
    smtpHost: preset.smtpHost,
    smtpPort: preset.smtpPort,
    imapHost: preset.imapHost,
    imapPort: preset.imapPort,
    username: email,
    password,
  });

  const handleTest = async () => {
    if (!email) {
      toast.error("Enter your email address");
      return;
    }
    if (!password && !isConnected) {
      toast.error("Enter your password");
      return;
    }
    setTesting(true);
    setTestResult({ smtp: null, imap: null });
    try {
      const res = await fetch("/api/email/account/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error("Server error");
      const data = await res.json();
      setTestResult(data);
      const passed = data.smtp?.ok && data.imap?.ok;
      if (passed) {
        toast.success("Connection test passed");
      } else {
        toast.error("Connection test failed — check credentials");
      }
    } catch {
      toast.error("Test request failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!email) {
      toast.error("Enter your email address");
      return;
    }
    if (!isConnected && !password) {
      toast.error("Enter your password");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/email/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        let message = "Failed to save";
        try {
          const err = await res.json();
          message = err.error ?? message;
        } catch {}
        throw new Error(message);
      }
      toast.success("Email account connected");
      router.push("/email/inbox");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your email account? All synced emails will be removed."))
      return;
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
    <div className="mx-auto h-full max-w-2xl space-y-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Email Account</h1>
        <p className="text-muted-foreground">
          Connect your email to send and receive messages within MIXSOON.
        </p>
      </div>

      <Tabs
        value={provider}
        onValueChange={(v) => {
          if (!isConnected) setProvider(v as Provider);
        }}
      >
        <div className="relative">
          <TabsList className="w-full">
            {(Object.keys(PROVIDERS) as Provider[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                disabled={isConnected && key !== provider}
                className="flex-1"
              >
                {PROVIDERS[key].label}
                {isConnected && key === provider && (
                  <Lock className="ml-1.5 h-3 w-3" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {(Object.keys(PROVIDERS) as Provider[]).map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {isConnected
                    ? `Connected — ${PROVIDERS[key].label}`
                    : `Connect with ${PROVIDERS[key].label}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`email-${key}`}>Email Address *</Label>
                  <Input
                    id={`email-${key}`}
                    type="email"
                    placeholder={PROVIDERS[key].placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`password-${key}`}>
                    Password{" "}
                    {isConnected ? "(leave blank to keep current)" : "*"}
                  </Label>
                  <Input
                    id={`password-${key}`}
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {PROVIDERS[key].note}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {(testResult.smtp || testResult.imap) && (
        <Card>
          <CardHeader>
            <CardTitle>Connection Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {testResult.smtp && (
              <div className="flex items-center gap-2">
                <span
                  className={
                    testResult.smtp.ok ? "text-green-600" : "text-red-600"
                  }
                >
                  {testResult.smtp.ok ? "✓" : "✗"}
                </span>
                <span>
                  SMTP:{" "}
                  {testResult.smtp.ok ? "Connected" : testResult.smtp.error}
                </span>
              </div>
            )}
            {testResult.imap && (
              <div className="flex items-center gap-2">
                <span
                  className={
                    testResult.imap.ok ? "text-green-600" : "text-red-600"
                  }
                >
                  {testResult.imap.ok ? "✓" : "✗"}
                </span>
                <span>
                  {provider === "hiworks" ? "POP3" : "IMAP"}:{" "}
                  {testResult.imap.ok ? "Connected" : testResult.imap.error}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? "Saving..."
            : isConnected
              ? "Update Account"
              : "Connect Account"}
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        {isConnected && (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            className="ml-auto"
          >
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
