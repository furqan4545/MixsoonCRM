"use client";

import {
  Check,
  Copy,
  Edit2,
  ExternalLink,
  Link2,
  Mail,
  Phone,
  Save,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getPlatformLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("youtube")) return "YouTube";
    if (host.includes("facebook") || host.includes("fb.com")) return "Facebook";
    if (host === "x.com" || host.includes("twitter")) return "X";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("linkedin")) return "LinkedIn";
    return host.replace(/^www\./, "").split(".")[0] ?? "Link";
  } catch {
    return "Link";
  }
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            aria-label={label ? `Copy ${label}` : "Copy"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {copied ? "Copied!" : "Copy"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ContactRowProps {
  icon: React.ReactNode;
  label: string;
  href?: string;
  copyValue: string;
  displayText?: string;
}

function ContactRow({
  icon,
  label,
  href,
  copyValue,
  displayText,
}: ContactRowProps) {
  const text = displayText ?? copyValue;
  const isInternalHref = Boolean(href?.startsWith("/"));
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        {href && isInternalHref ? (
          <Link
            href={href}
            className="min-w-0 truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {text}
          </Link>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            {text}
          </a>
        ) : (
          <span className="truncate text-sm">{text}</span>
        )}
      </div>
      <CopyButton value={copyValue} label={label} />
    </div>
  );
}

interface InfluencerContactSectionProps {
  influencerId?: string;
  email: string | null;
  secondaryEmails?: string[];
  phone: string | null;
  bioLinkUrl: string | null;
  socialLinksJson: string | null;
  onEmailChange?: (newEmail: string | null) => void;
  onSecondaryEmailsChange?: (next: string[]) => void;
  onPhoneChange?: (newPhone: string | null) => void;
  onBioLinkUrlChange?: (newUrl: string | null) => void;
}

export function InfluencerContactSection({
  influencerId,
  email,
  secondaryEmails = [],
  phone,
  bioLinkUrl,
  socialLinksJson,
  onEmailChange,
  onSecondaryEmailsChange,
  onPhoneChange,
  onBioLinkUrlChange,
}: InfluencerContactSectionProps) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(email ?? "");
  const [displayEmail, setDisplayEmail] = useState(email);

  const [secondaries, setSecondaries] = useState<string[]>(secondaryEmails);
  const [newSecondary, setNewSecondary] = useState("");
  const [secondaryError, setSecondaryError] = useState<string | null>(null);

  useEffect(() => {
    setSecondaries(secondaryEmails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondaryEmails.join("|")]);

  const addSecondary = () => {
    const v = newSecondary.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setSecondaryError("Doesn't look like a valid email");
      return;
    }
    if (v === (displayEmail ?? "").toLowerCase()) {
      setSecondaryError("Already the primary email");
      return;
    }
    if (secondaries.includes(v)) {
      setSecondaryError("Already added");
      return;
    }
    const next = [...secondaries, v];
    setSecondaries(next);
    setNewSecondary("");
    setSecondaryError(null);
    onSecondaryEmailsChange?.(next);
  };

  const removeSecondary = (e: string) => {
    const next = secondaries.filter((x) => x !== e);
    setSecondaries(next);
    onSecondaryEmailsChange?.(next);
  };

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(phone ?? "");
  const [displayPhone, setDisplayPhone] = useState(phone);

  const [editingBioLink, setEditingBioLink] = useState(false);
  const [bioLinkInput, setBioLinkInput] = useState(bioLinkUrl ?? "");
  const [displayBioLink, setDisplayBioLink] = useState(bioLinkUrl);

  useEffect(() => {
    setDisplayEmail(email);
    setEmailInput(email ?? "");
  }, [email]);

  useEffect(() => {
    setDisplayPhone(phone);
    setPhoneInput(phone ?? "");
  }, [phone]);

  useEffect(() => {
    setDisplayBioLink(bioLinkUrl);
    setBioLinkInput(bioLinkUrl ?? "");
  }, [bioLinkUrl]);

  const handleSaveEmail = useCallback(() => {
    const trimmed = emailInput.trim();
    const newEmail = trimmed || null;
    setEditingEmail(false);
    if (trimmed !== (displayEmail ?? "")) {
      setDisplayEmail(newEmail);
      onEmailChange?.(newEmail);
    }
  }, [emailInput, displayEmail, onEmailChange]);

  const handleSavePhone = useCallback(() => {
    const trimmed = phoneInput.trim();
    const newPhone = trimmed || null;
    setEditingPhone(false);
    if (trimmed !== (displayPhone ?? "")) {
      setDisplayPhone(newPhone);
      onPhoneChange?.(newPhone);
    }
  }, [phoneInput, displayPhone, onPhoneChange]);

  const handleSaveBioLink = useCallback(() => {
    const trimmed = bioLinkInput.trim();
    const newUrl = trimmed || null;
    setEditingBioLink(false);
    if (trimmed !== (displayBioLink ?? "")) {
      setDisplayBioLink(newUrl);
      onBioLinkUrlChange?.(newUrl);
    }
  }, [bioLinkInput, displayBioLink, onBioLinkUrlChange]);

  let socialUrls: string[] = [];
  try {
    if (socialLinksJson) {
      const parsed = JSON.parse(socialLinksJson) as unknown;
      socialUrls = Array.isArray(parsed)
        ? (parsed as string[]).filter(
            (u) => typeof u === "string" && u.startsWith("http"),
          )
        : [];
    }
  } catch {
    // ignore
  }

  const hasAny = displayEmail || displayPhone || displayBioLink || socialUrls.length > 0 || onEmailChange || onPhoneChange || onBioLinkUrlChange;
  if (!hasAny) return null;
  const composeHref = displayEmail
    ? `/email/compose?to=${encodeURIComponent(displayEmail)}${influencerId ? `&influencerId=${influencerId}` : ""}`
    : "";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Contact &amp; socials
      </h3>
      <div className="space-y-2">
        {editingEmail ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEmail();
                  if (e.key === "Escape") {
                    setEditingEmail(false);
                    setEmailInput(displayEmail ?? "");
                  }
                }}
                placeholder="influencer@example.com"
                className="h-6 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 gap-1"
              onClick={handleSaveEmail}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setEditingEmail(false);
                setEmailInput(displayEmail ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : displayEmail ? (
          <div className="flex items-center gap-2">
            <div className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              {onEmailChange ? (
                <button
                  type="button"
                  onClick={() => { setEmailInput(displayEmail ?? ""); setEditingEmail(true); }}
                  className="min-w-0 truncate text-sm text-blue-600 hover:underline dark:text-blue-400 text-left"
                  title="Click to edit email"
                >
                  {displayEmail}
                </button>
              ) : (
                <span className="min-w-0 truncate text-sm">{displayEmail}</span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {onEmailChange && (
                  <button
                    type="button"
                    onClick={() => { setEmailInput(displayEmail ?? ""); setEditingEmail(true); }}
                    className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Edit email"
                    aria-label="Edit email"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <CopyButton value={displayEmail!} label="email" />
              </div>
            </div>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                  >
                    <Link href={composeHref}>
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Compose email in MIXSOON</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : onEmailChange ? (
          <button
            type="button"
            onClick={() => {
              setEmailInput("");
              setEditingEmail(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Mail className="h-4 w-4" />
            <span>Add email address</span>
          </button>
        ) : null}

        {/* Secondary emails — CC'd on every outgoing influencer email
            (contract, brief, payment, proof, status notification). */}
        {onSecondaryEmailsChange && (
          <div className="rounded-lg border bg-muted/20 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Additional emails (CC)
              </p>
              <span className="text-[10px] text-muted-foreground">
                {secondaries.length} added
              </span>
            </div>
            {secondaries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {secondaries.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-full bg-background border px-2.5 py-0.5 text-xs"
                  >
                    {e}
                    <button
                      type="button"
                      onClick={() => removeSecondary(e)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${e}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="email"
                placeholder="manager@example.com"
                value={newSecondary}
                onChange={(e) => {
                  setNewSecondary(e.target.value);
                  if (secondaryError) setSecondaryError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSecondary();
                  }
                }}
                className="flex-1 rounded-md border bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={addSecondary}
                disabled={!newSecondary.trim()}
                className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {secondaryError && (
              <p className="text-[10px] text-destructive">{secondaryError}</p>
            )}
          </div>
        )}
        {editingPhone ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSavePhone();
                  if (e.key === "Escape") {
                    setEditingPhone(false);
                    setPhoneInput(displayPhone ?? "");
                  }
                }}
                placeholder="+1 555 123 4567"
                className="h-6 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Button type="button" variant="default" size="sm" className="shrink-0 gap-1" onClick={handleSavePhone}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { setEditingPhone(false); setPhoneInput(displayPhone ?? ""); }}>
              Cancel
            </Button>
          </div>
        ) : displayPhone ? (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-sm">{displayPhone}</span>
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <CopyButton value={displayPhone} label="phone" />
                {onPhoneChange && (
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => { setPhoneInput(displayPhone ?? ""); setEditingPhone(true); }} title="Edit phone">
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : onPhoneChange ? (
          <button
            type="button"
            onClick={() => { setPhoneInput(""); setEditingPhone(true); }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Phone className="h-4 w-4" />
            <span>Add phone number</span>
          </button>
        ) : null}
        {editingBioLink ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                type="url"
                value={bioLinkInput}
                onChange={(e) => setBioLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveBioLink();
                  if (e.key === "Escape") { setEditingBioLink(false); setBioLinkInput(displayBioLink ?? ""); }
                }}
                placeholder="https://linktr.ee/username"
                className="h-6 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <Button type="button" variant="default" size="sm" className="shrink-0 gap-1" onClick={handleSaveBioLink}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => { setEditingBioLink(false); setBioLinkInput(displayBioLink ?? ""); }}>
              Cancel
            </Button>
          </div>
        ) : displayBioLink ? (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a href={displayBioLink} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm text-blue-600 hover:underline dark:text-blue-400">
                {displayBioLink.replace(/^https?:\/\//, "").split("/")[0] ?? displayBioLink}
              </a>
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <CopyButton value={displayBioLink} label="bio link" />
                <a href={displayBioLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Open link">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {onBioLinkUrlChange && (
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => { setBioLinkInput(displayBioLink ?? ""); setEditingBioLink(true); }} title="Edit link">
                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : onBioLinkUrlChange ? (
          <button
            type="button"
            onClick={() => { setBioLinkInput(""); setEditingBioLink(true); }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Link2 className="h-4 w-4" />
            <span>Add bio link</span>
          </button>
        ) : null}
        {socialUrls.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                {getPlatformLabel(url)} —{" "}
                {url.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            </div>
            <CopyButton value={url} label={getPlatformLabel(url)} />
          </div>
        ))}
      </div>
    </div>
  );
}
