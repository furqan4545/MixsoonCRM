"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { KOREAN_BANKS } from "@/app/lib/korean-banks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContentSubmissionFormProps {
  token: string;
  influencerName: string;
  showVideoLinks: boolean;
  showPayment: boolean;
  requireScode?: boolean;
  submissionLabel?: string;
}

interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankCode: string;
}

const defaultBank: BankDetails = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  bankCode: "",
};

export function ContentSubmissionForm({
  token,
  influencerName,
  showVideoLinks,
  showPayment,
  requireScode = false,
  submissionLabel: initialLabel,
}: ContentSubmissionFormProps) {
  const [videoLinks, setVideoLinks] = useState<string[]>([""]);
  const [notes, setNotes] = useState("");
  const [sCode, setSCode] = useState("");
  const [submissionLabel, setSubmissionLabel] = useState(initialLabel ?? "");
  const [bank, setBank] = useState<BankDetails>(defaultBank);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `content_submission_${token}`;

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.videoLinks?.length) setVideoLinks(data.videoLinks);
        if (data.notes) setNotes(data.notes);
        if (data.bank) setBank({ ...defaultBank, ...data.bank });
      }
    } catch {}
  }, [storageKey]);

  // Auto-save to localStorage
  const saveToStorage = useCallback(
    (links: string[], n: string, b: BankDetails) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ videoLinks: links, notes: n, bank: b }),
        );
      } catch {}
    },
    [storageKey],
  );

  const addVideoLink = () => {
    const updated = [...videoLinks, ""];
    setVideoLinks(updated);
    saveToStorage(updated, notes, bank);
  };

  const removeVideoLink = (index: number) => {
    if (videoLinks.length <= 1) return;
    const updated = videoLinks.filter((_, i) => i !== index);
    setVideoLinks(updated);
    saveToStorage(updated, notes, bank);
  };

  const updateVideoLink = (index: number, value: string) => {
    const updated = [...videoLinks];
    updated[index] = value;
    setVideoLinks(updated);
    saveToStorage(updated, notes, bank);
  };

  const updateNotes = (value: string) => {
    setNotes(value);
    saveToStorage(videoLinks, value, bank);
  };

  const updateBank = (field: keyof BankDetails, value: string) => {
    setBank((prev) => {
      const next = { ...prev, [field]: value };
      saveToStorage(videoLinks, notes, next);
      return next;
    });
  };

  const handleBankSelect = (bankCode: string) => {
    const b = KOREAN_BANKS.find((k) => k.code === bankCode);
    if (b) {
      setBank((prev) => {
        const next = { ...prev, bankName: b.nameKo, bankCode: b.code };
        saveToStorage(videoLinks, notes, next);
        return next;
      });
    }
  };

  const canSubmit = () => {
    if (showVideoLinks) {
      const validLinks = videoLinks.filter((l) => l.trim());
      if (validLinks.length === 0) return false;
    }
    if (requireScode && !sCode.trim()) return false;
    if (showPayment) {
      if (!bank.bankName || !bank.accountNumber || !bank.accountHolder) return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { token };

      if (showVideoLinks) {
        payload.videoLinks = videoLinks.filter((l) => l.trim());
      }
      if (notes.trim()) {
        payload.notes = notes.trim();
      }
      if (sCode.trim()) {
        payload.sCode = sCode.trim();
      }
      if (submissionLabel.trim()) {
        payload.submissionLabel = submissionLabel.trim();
      }
      if (showPayment) {
        payload.bankDetails = {
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolder: bank.accountHolder,
          bankCode: bank.bankCode || undefined,
        };
      }

      const res = await fetch("/api/portal/submit-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      localStorage.removeItem(storageKey);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold">Submitted!</h1>
        <p className="text-muted-foreground max-w-md">
          Thank you, {influencerName}. Your{" "}
          {showVideoLinks ? "content" : "payment details"}{" "}
          {showVideoLinks && showPayment ? "and payment details have" : "has"}{" "}
          been submitted successfully. You may close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Video Links Section */}
      {showVideoLinks && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Video Links</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Submit the links to your posted videos. You can add multiple links.
            </p>
          </div>

          <div className="space-y-3">
            {videoLinks.map((link, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    type="url"
                    placeholder={`https://www.tiktok.com/@username/video/... ${index === 0 ? "" : "(optional)"}`}
                    value={link}
                    onChange={(e) => updateVideoLink(index, e.target.value)}
                  />
                </div>
                {videoLinks.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeVideoLink(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addVideoLink}
            className="w-full"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Another Video Link
          </Button>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => updateNotes(e.target.value)}
              placeholder="Any additional notes about your content..."
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px] resize-y"
            />
          </div>
        </div>
      )}

      {/* S-Code & Submission Label */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="submissionLabel">Submission Label</Label>
            <Input
              id="submissionLabel"
              type="text"
              placeholder="e.g. 1st video, Week 3"
              value={submissionLabel}
              onChange={(e) => setSubmissionLabel(e.target.value)}
              className="mt-1.5"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Label to identify this submission</p>
          </div>
          <div>
            <Label htmlFor="sCode">
              S-Code {requireScode && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="sCode"
              type="text"
              placeholder="Enter S-code"
              value={sCode}
              onChange={(e) => setSCode(e.target.value)}
              className="mt-1.5"
            />
            {requireScode && (
              <p className="mt-1 text-[10px] text-destructive">Required — you must enter an S-code to submit</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Details Section */}
      {showPayment && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Payment Details</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please provide your payment information. You can use any bank, PayPal, Stripe, or other payment method.
            </p>
          </div>

          <div>
            <Label htmlFor="bankName">Bank / Payment Method</Label>
            <Input
              id="bankName"
              type="text"
              placeholder="e.g. KB Kookmin Bank, PayPal, Stripe, Chase Bank..."
              value={bank.bankName}
              onChange={(e) => updateBank("bankName", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="accountNumber">Account Number / Payment ID</Label>
            <Input
              id="accountNumber"
              type="text"
              placeholder="Bank account number, PayPal email, Stripe ID..."
              value={bank.accountNumber}
              onChange={(e) => updateBank("accountNumber", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="accountHolder">Account Holder Name</Label>
            <Input
              id="accountHolder"
              type="text"
              placeholder="Name as it appears on the account"
              value={bank.accountHolder}
              onChange={(e) => updateBank("accountHolder", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit() || submitting}
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Submit
              <Check className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
