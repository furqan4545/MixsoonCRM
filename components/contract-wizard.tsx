"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { KOREAN_BANKS } from "@/app/lib/korean-banks";
import type { ContractField } from "@/app/lib/contract-fields";
import { SignaturePad } from "@/components/signature-pad";
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

const PdfSignerViewLazy = dynamic(
  () => import("@/components/pdf-signer-view").then((m) => m.PdfSignerView),
  { ssr: false, loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div> },
);

/* ── Types ── */
interface ContractWizardProps {
  token: string;
  contractId: string;
  // HTML mode (backward compat)
  htmlContent?: string;
  // PDF mode
  pdfUrl?: string;
  fields?: ContractField[];
  // Shared
  influencerName: string;
  requireBankDetails: boolean;
  requireShippingAddress: boolean;
}

interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankCode: string;
}

interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
}

const defaultBank: BankDetails = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  bankCode: "",
};

const defaultShipping: ShippingAddress = {
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "South Korea",
};

/* ── Step definitions ── */
interface StepDef {
  key: string;
  label: string;
}

function buildSteps(requireBank: boolean, requireShipping: boolean): StepDef[] {
  const steps: StepDef[] = [{ key: "sign", label: "Review & Sign" }];
  if (requireBank) steps.push({ key: "bank", label: "Bank Details" });
  if (requireShipping) steps.push({ key: "shipping", label: "Shipping Address" });
  return steps;
}

/* ── Main component ── */
export function ContractWizard({
  token,
  contractId,
  htmlContent,
  pdfUrl,
  fields: pdfFields,
  influencerName,
  requireBankDetails,
  requireShippingAddress,
}: ContractWizardProps) {
  const isPdfMode = !!pdfUrl;
  const steps = buildSteps(requireBankDetails, requireShippingAddress);
  const [currentStep, setCurrentStep] = useState(0);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // PDF mode: per-field values { fieldId: value }
  const [pdfFieldValues, setPdfFieldValues] = useState<Record<string, string>>({});
  const [bank, setBank] = useState<BankDetails>(defaultBank);
  const [shipping, setShipping] = useState<ShippingAddress>(defaultShipping);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `contract_wizard_${token}`;

  // Track that the influencer opened the contract (fire-and-forget)
  useEffect(() => {
    fetch("/api/portal/track-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {}); // Silently ignore errors
  }, [token]);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.bank) setBank({ ...defaultBank, ...data.bank });
        if (data.shipping) setShipping({ ...defaultShipping, ...data.shipping });
      }
    } catch {}
  }, [storageKey]);

  // Auto-save form state to localStorage
  const saveToStorage = useCallback(
    (newBank: BankDetails, newShipping: ShippingAddress) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ bank: newBank, shipping: newShipping }),
        );
      } catch {}
    },
    [storageKey],
  );

  const updateBank = useCallback(
    (field: keyof BankDetails, value: string) => {
      setBank((prev) => {
        const next = { ...prev, [field]: value };
        saveToStorage(next, shipping);
        return next;
      });
    },
    [saveToStorage, shipping],
  );

  const handleBankSelect = useCallback(
    (bankCode: string) => {
      const b = KOREAN_BANKS.find((k) => k.code === bankCode);
      if (b) {
        setBank((prev) => {
          const next = { ...prev, bankName: b.nameKo, bankCode: b.code };
          saveToStorage(next, shipping);
          return next;
        });
      }
    },
    [saveToStorage, shipping],
  );

  const updateShipping = useCallback(
    (field: keyof ShippingAddress, value: string) => {
      setShipping((prev) => {
        const next = { ...prev, [field]: value };
        saveToStorage(bank, next);
        return next;
      });
    },
    [saveToStorage, bank],
  );

  const isLastStep = currentStep === steps.length - 1;
  const currentStepKey = steps[currentStep]?.key;

  // Step validation
  const canProceed = () => {
    if (currentStepKey === "sign") {
      if (isPdfMode && pdfFields?.length) {
        // All fields must have a non-empty value
        return pdfFields.every((f) => !!pdfFieldValues[f.id]?.trim());
      }
      return !!signatureDataUrl;
    }
    if (currentStepKey === "bank") {
      return !!(bank.bankName && bank.accountNumber && bank.accountHolder);
    }
    if (currentStepKey === "shipping") {
      return !!(shipping.fullName && shipping.addressLine1 && shipping.city && shipping.postalCode);
    }
    return true;
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        token,
        signatureDataUrl: isPdfMode ? null : signatureDataUrl,
        fieldValues: isPdfMode ? pdfFieldValues : undefined,
      };
      if (requireBankDetails) {
        payload.bankDetails = {
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolder: bank.accountHolder,
          bankCode: bank.bankCode || undefined,
        };
      }
      if (requireShippingAddress) {
        payload.shippingAddress = {
          fullName: shipping.fullName,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2 || undefined,
          city: shipping.city,
          postalCode: shipping.postalCode,
          country: shipping.country,
        };
      }

      const res = await fetch("/api/portal/submit", {
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

  const handleNext = () => {
    if (isLastStep) {
      handleSubmit();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  // ── Submitted state ──
  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold">All Done!</h1>
        <p className="text-muted-foreground max-w-md">
          Thank you, {influencerName}. Your contract has been signed
          {requireBankDetails ? " and bank details submitted" : ""}
          {requireShippingAddress ? " and shipping address provided" : ""}.
          You may close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress stepper */}
      {steps.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (i < currentStep) setCurrentStep(i);
                }}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === currentStep
                    ? "bg-foreground text-background"
                    : i < currentStep
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-pointer hover:bg-green-200"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < currentStep ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold">
                    {i + 1}
                  </span>
                )}
                {step.label}
              </button>
              {i < steps.length - 1 && (
                <div className={`h-px w-8 ${i < currentStep ? "bg-green-400" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step content */}
      {currentStepKey === "sign" && (
        <div className="space-y-6">
          {isPdfMode && pdfUrl ? (
            <PdfSignerViewLazy
              pdfUrl={pdfUrl}
              fields={pdfFields || []}
              influencerName={influencerName}
              onFieldValuesChange={setPdfFieldValues}
            />
          ) : (
            <>
              {/* HTML contract content (legacy) */}
              <div className="rounded-lg border border-border bg-white p-6 md:p-8">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: htmlContent || "" }}
                />
              </div>
              {/* Signature */}
              <div className="rounded-lg border border-border p-6">
                <h2 className="mb-4 text-lg font-semibold">Your Signature</h2>
                <SignaturePad onSignatureChange={setSignatureDataUrl} />
              </div>
            </>
          )}
        </div>
      )}

      {currentStepKey === "bank" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Bank Details</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please provide your bank account information for payment.
            </p>
          </div>

          <div>
            <Label htmlFor="bankSelect">Bank</Label>
            <Select value={bank.bankCode} onValueChange={handleBankSelect}>
              <SelectTrigger id="bankSelect" className="mt-1.5">
                <SelectValue placeholder="Select your bank" />
              </SelectTrigger>
              <SelectContent>
                {KOREAN_BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.nameKo} ({b.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="accountNumber">Account Number</Label>
            <Input
              id="accountNumber"
              type="text"
              placeholder="Enter your account number"
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

      {currentStepKey === "shipping" && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Shipping Address</h2>
            <p className="text-sm text-muted-foreground mt-1">
              We&apos;ll send products to this address.
            </p>
          </div>

          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Full name for delivery"
              value={shipping.fullName}
              onChange={(e) => updateShipping("fullName", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="addressLine1">Address Line 1</Label>
            <Input
              id="addressLine1"
              type="text"
              placeholder="Street address"
              value={shipping.addressLine1}
              onChange={(e) => updateShipping("addressLine1", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
            <Input
              id="addressLine2"
              type="text"
              placeholder="Apartment, suite, unit, etc."
              value={shipping.addressLine2}
              onChange={(e) => updateShipping("addressLine2", e.target.value)}
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
                value={shipping.city}
                onChange={(e) => updateShipping("city", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input
                id="postalCode"
                type="text"
                placeholder="Postal code"
                value={shipping.postalCode}
                onChange={(e) => updateShipping("postalCode", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="country">Country</Label>
            <Select
              value={shipping.country}
              onValueChange={(v) => updateShipping("country", v)}
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
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <div>
          {currentStep > 0 && (
            <Button variant="outline" onClick={handleBack}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          )}
        </div>
        <Button
          onClick={handleNext}
          disabled={!canProceed() || submitting}
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : isLastStep ? (
            <>
              Submit
              <Check className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
