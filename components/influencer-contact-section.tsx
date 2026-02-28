"use client";

import {
  Check,
  Copy,
  Edit2,
  ExternalLink,
  Link2,
  Mail,
  Phone,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
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
  phone: string | null;
  bioLinkUrl: string | null;
  socialLinksJson: string | null;
  onEmailChange?: (newEmail: string | null) => void;
}

export function InfluencerContactSection({
  influencerId,
  email,
  phone,
  bioLinkUrl,
  socialLinksJson,
  onEmailChange,
}: InfluencerContactSectionProps) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(email ?? "");

  const handleSaveEmail = useCallback(() => {
    const trimmed = emailInput.trim();
    setEditingEmail(false);
    if (trimmed !== (email ?? "")) {
      onEmailChange?.(trimmed || null);
    }
  }, [emailInput, email, onEmailChange]);
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

  const hasAny = email || phone || bioLinkUrl || socialUrls.length > 0 || onEmailChange;
  if (!hasAny) return null;
  const composeHref = email
    ? `/email/compose?to=${encodeURIComponent(email)}${influencerId ? `&influencerId=${influencerId}` : ""}`
    : "";

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Contact &amp; socials
      </h3>
      <div className="space-y-2">
        {editingEmail ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onBlur={handleSaveEmail}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveEmail();
                if (e.key === "Escape") {
                  setEditingEmail(false);
                  setEmailInput(email ?? "");
                }
              }}
              placeholder="influencer@example.com"
              className="h-6 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        ) : email ? (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ContactRow
                icon={<Mail className="h-4 w-4" />}
                label="email"
                href={composeHref}
                copyValue={email}
                displayText={email}
              />
            </div>
            {onEmailChange && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setEmailInput(email);
                  setEditingEmail(true);
                }}
                title="Edit email"
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
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
        {phone && (
          <ContactRow
            icon={<Phone className="h-4 w-4" />}
            label="phone"
            href={`tel:${phone.replace(/\s/g, "")}`}
            copyValue={phone}
            displayText={phone}
          />
        )}
        {bioLinkUrl && (
          <ContactRow
            icon={<Link2 className="h-4 w-4" />}
            label="bio link"
            href={bioLinkUrl}
            copyValue={bioLinkUrl}
            displayText={
              bioLinkUrl.replace(/^https?:\/\//, "").split("/")[0] ?? bioLinkUrl
            }
          />
        )}
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
