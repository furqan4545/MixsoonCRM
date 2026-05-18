"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Campaign {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  influencerId: string;
  influencerUsername: string;
  onSuccess?: () => void;
}

export function SendBriefDialog({
  open,
  onOpenChange,
  influencerId,
  influencerUsername,
  onSuccess,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignId, setCampaignId] = useState<string>("");
  const [body, setBody] = useState("");
  const [howToPost, setHowToPost] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"override" | "campaign-default" | null>(null);
  const [saveAsOverride, setSaveAsOverride] = useState(false);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [sending, setSending] = useState(false);

  // Load campaigns when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingCampaigns(true);
    fetch("/api/marketing-campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Campaign[]) => {
        if (cancelled) return;
        setCampaigns(list);
        if (list.length > 0 && !campaignId) setCampaignId(list[0].id);
      })
      .finally(() => {
        if (!cancelled) setLoadingCampaigns(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When campaign changes, fetch the pre-fill (override OR campaign default).
  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    setLoadingBrief(true);
    fetch(`/api/influencers/${influencerId}/brief?campaignId=${campaignId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setBody(data.body ?? "");
        setHowToPost(data.howToPost ?? "");
        setHashtagsInput((data.hashtags ?? []).join(", "));
        setSource(data.source);
        setSaveAsOverride(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingBrief(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, campaignId, influencerId]);

  const reset = () => {
    setCampaignId("");
    setBody("");
    setHowToPost("");
    setHashtagsInput("");
    setUploadDate("");
    setNotes("");
    setSource(null);
    setSaveAsOverride(false);
    setSending(false);
  };

  const handleSend = async () => {
    if (!campaignId || !body.trim() || sending) return;
    const hashtags = hashtagsInput
      .split(/[,\n]/)
      .map((h) => h.trim().replace(/^#/, ""))
      .filter(Boolean);
    setSending(true);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          body: body.trim(),
          howToPost: howToPost.trim() || null,
          hashtags,
          uploadDate: uploadDate || null,
          notes: notes.trim() || null,
          saveAsOverride,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to send brief");
        return;
      }
      toast.success(`Brief sent to @${influencerUsername}`, {
        description: saveAsOverride ? "Saved as override for next time" : undefined,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      });
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Failed to send brief");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send content brief</DialogTitle>
          <DialogDescription>
            One-way email to @{influencerUsername}. Pre-filled from this campaign's defaults — edit before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="brief-campaign">Campaign / Product</Label>
            <select
              id="brief-campaign"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              disabled={loadingCampaigns || sending}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {loadingCampaigns && <option>Loading…</option>}
              {!loadingCampaigns && campaigns.length === 0 && (
                <option value="">No campaigns yet — create one first</option>
              )}
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="brief-body">Guidelines</Label>
              {source && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    source === "override"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {source === "override" ? "Influencer override" : "Campaign default"}
                </span>
              )}
            </div>
            <Textarea
              id="brief-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={loadingBrief || sending}
              rows={5}
              placeholder="Key messages, tone, what to talk about, do/don't…"
              className="resize-none"
            />
          </div>

          <div>
            <Label htmlFor="brief-how">How to post</Label>
            <Textarea
              id="brief-how"
              value={howToPost}
              onChange={(e) => setHowToPost(e.target.value)}
              disabled={loadingBrief || sending}
              rows={4}
              placeholder="Technical rules — format, length, caption, mentions, music…"
              className="resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="brief-upload-date">Upload date</Label>
              <input
                id="brief-upload-date"
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                disabled={sending}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                When you want them to post. (optional)
              </p>
            </div>
            <div>
              <Label htmlFor="brief-hashtags">Hashtags</Label>
              <Input
                id="brief-hashtags"
                value={hashtagsInput}
                onChange={(e) => setHashtagsInput(e.target.value)}
                disabled={loadingBrief || sending}
                placeholder="mixsoon, kbeauty"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Comma-separated.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="brief-notes">Additional notes (optional)</Label>
            <Textarea
              id="brief-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={sending}
              rows={3}
              placeholder="Anything specific for this send — deadline reminders, asks, context…"
              className="resize-none"
            />
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsOverride}
              onChange={(e) => setSaveAsOverride(e.target.checked)}
              disabled={sending}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                Save Guidelines / How-to-post / Hashtags as @{influencerUsername}'s version
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                Next time you brief them for this campaign, your edits pre-fill instead of the campaign default. (Upload date and notes stay per-send.)
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!campaignId || !body.trim() || sending || loadingBrief}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="h-3 w-3 mr-2" />
                Send to @{influencerUsername}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
