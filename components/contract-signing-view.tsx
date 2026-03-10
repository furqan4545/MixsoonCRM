"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";

interface ContractSigningViewProps {
  token: string;
  contractId: string;
  htmlContent: string;
  influencerName: string;
}

export function ContractSigningView({
  token,
  contractId,
  htmlContent,
  influencerName,
}: ContractSigningViewProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    if (!signatureDataUrl) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/contracts/${contractId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureDataUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sign contract");
      }

      setSigned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (signed) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
          <span className="text-3xl">&#9989;</span>
        </div>
        <h1 className="text-2xl font-bold">Contract Signed!</h1>
        <p className="text-muted-foreground">
          Thank you, {influencerName}. Your signed contract has been recorded.
          A copy will be sent to you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Contract content */}
      <div className="rounded-lg border border-border bg-white p-8">
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>

      {/* Signature section */}
      <div className="rounded-lg border border-border p-6">
        <h2 className="mb-4 text-lg font-semibold">Your Signature</h2>
        <SignaturePad onSignatureChange={setSignatureDataUrl} />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        onClick={handleSign}
        className="w-full"
        size="lg"
        disabled={!signatureDataUrl || submitting}
      >
        {submitting ? "Signing..." : "Sign & Submit Contract"}
      </Button>
    </div>
  );
}
