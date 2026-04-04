"use client";

import { useCallback, useEffect, useState } from "react";
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

interface FormData {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankCode: string;
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
}

const defaultForm: FormData = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  bankCode: "",
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "South Korea",
};

interface OnboardingFormProps {
  token: string;
  influencer: {
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
  };
}

export function OnboardingForm({ token, influencer }: OnboardingFormProps) {
  const storageKey = `onboarding_${token}`;
  const [form, setForm] = useState<FormData>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setForm({ ...defaultForm, ...JSON.parse(saved) });
      }
    } catch {}
  }, [storageKey]);

  // Auto-save to localStorage
  const updateField = useCallback(
    (field: keyof FormData, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [storageKey],
  );

  const handleBankSelect = useCallback(
    (bankCode: string) => {
      const bank = KOREAN_BANKS.find((b) => b.code === bankCode);
      if (bank) {
        setForm((prev) => {
          const next = {
            ...prev,
            bankName: bank.nameKo,
            bankCode: bank.code,
          };
          try {
            localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    },
    [storageKey],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/onboarding/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      // Clear localStorage on success
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
          <span className="text-3xl">&#9989;</span>
        </div>
        <h1 className="text-2xl font-bold">Onboarding Complete!</h1>
        <p className="text-muted-foreground">
          Thank you, {influencer.displayName || influencer.username}. Your information has been submitted successfully.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Bank Details Section */}
      <div className="rounded-lg border border-border p-6">
        <h2 className="mb-4 text-lg font-semibold">Payment Details</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bankName">Bank / Payment Method</Label>
            <Input
              id="bankName"
              type="text"
              placeholder="e.g. KB Kookmin Bank, PayPal, Stripe, Chase Bank..."
              value={form.bankName}
              onChange={(e) => updateField("bankName", e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div>
            <Label htmlFor="accountNumber">Account Number / Payment ID</Label>
            <Input
              id="accountNumber"
              type="text"
              placeholder="Bank account number, PayPal email, Stripe ID..."
              value={form.accountNumber}
              onChange={(e) => updateField("accountNumber", e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div>
            <Label htmlFor="accountHolder">Account Holder Name</Label>
            <Input
              id="accountHolder"
              type="text"
              placeholder="Name as it appears on the account"
              value={form.accountHolder}
              onChange={(e) => updateField("accountHolder", e.target.value)}
              className="mt-1.5"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="swiftCode">SWIFT / BIC Code <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="swiftCode"
                type="text"
                placeholder="e.g. CITIKRSX"
                value={form.bankCode || ""}
                onChange={(e) => updateField("bankCode", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="routingNumber">Routing Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="routingNumber"
                type="text"
                placeholder="For US banks"
                value={form.routingNumber || ""}
                onChange={(e) => updateField("routingNumber", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="contactNumber">Contact Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="contactNumber"
              type="tel"
              placeholder="+1 234 567 8900"
              value={form.contactNumber || ""}
              onChange={(e) => updateField("contactNumber", e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      {/* Shipping Address Section */}
      <div className="rounded-lg border border-border p-6">
        <h2 className="mb-4 text-lg font-semibold">Shipping Address</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Full name for delivery"
              value={form.fullName}
              onChange={(e) => updateField("fullName", e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div>
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              type="text"
              placeholder="Street address"
              value={form.addressLine1}
              onChange={(e) => updateField("addressLine1", e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div>
            <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
            <Input
              id="addressLine2"
              type="text"
              placeholder="Apartment, suite, unit, etc."
              value={form.addressLine2}
              onChange={(e) => updateField("addressLine2", e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                type="text"
                placeholder="City"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="mt-1.5"
                required
              />
            </div>
            <div>
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                type="text"
                placeholder="Postal code"
                value={form.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
                className="mt-1.5"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Select
              value={form.country}
              onValueChange={(v) => updateField("country", v)}
            >
              <SelectTrigger id="country" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="South Korea">South Korea</SelectItem>
                <SelectItem value="United States">United States</SelectItem>
                <SelectItem value="Japan">Japan</SelectItem>
                <SelectItem value="China">China</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit Onboarding Information"}
      </Button>
    </form>
  );
}
