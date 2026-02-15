"use client";

import { useState, useCallback } from "react";
import { Mail, Phone, Link2, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
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
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        {href ? (
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
  email: string | null;
  phone: string | null;
  bioLinkUrl: string | null;
  socialLinksJson: string | null;
}

export function InfluencerContactSection({
  email,
  phone,
  bioLinkUrl,
  socialLinksJson,
}: InfluencerContactSectionProps) {
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

  const hasAny =
    email || phone || bioLinkUrl || socialUrls.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Contact &amp; socials
      </h3>
      <div className="space-y-2">
        {email && (
          <ContactRow
            icon={<Mail className="h-4 w-4" />}
            label="email"
            href={`mailto:${email}`}
            copyValue={email}
            displayText={email}
          />
        )}
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
                {getPlatformLabel(url)} — {url.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            </div>
            <CopyButton value={url} label={getPlatformLabel(url)} />
          </div>
        ))}
      </div>
    </div>
  );
}
