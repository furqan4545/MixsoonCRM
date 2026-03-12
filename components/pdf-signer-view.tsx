"use client";

import { useCallback, useState } from "react";
import { type ContractField, FIELD_COLORS, FIELD_DEFAULTS } from "@/app/lib/contract-fields";
import { PdfAllPages } from "@/components/pdf-page-viewer";
import { SignaturePad } from "@/components/signature-pad";
import { PenLine, Calendar, User, X } from "lucide-react";

interface PdfSignerViewProps {
  pdfUrl: string;
  fields: ContractField[];
  influencerName: string;
  onSignatureChange: (dataUrl: string | null) => void;
}

export function PdfSignerView({
  pdfUrl,
  fields,
  influencerName,
  onSignatureChange,
}: PdfSignerViewProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const todayStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleSignature = useCallback(
    (dataUrl: string | null) => {
      setSignatureDataUrl(dataUrl);
      onSignatureChange(dataUrl);
      if (dataUrl) setShowSignaturePad(false);
    },
    [onSignatureChange],
  );

  const renderPageOverlay = useCallback(
    (pageNumber: number) => {
      const pageFields = fields.filter((f) => f.page === pageNumber);
      return (
        <>
          {pageFields.map((field) => {
            const colors = FIELD_COLORS[field.type];
            return (
              <div
                key={field.id}
                className="absolute pointer-events-auto"
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  border: `2px solid ${colors.border}`,
                  backgroundColor: colors.bg,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {field.type === "signature" && (
                  <>
                    {signatureDataUrl ? (
                      <img
                        src={signatureDataUrl}
                        alt="Signature"
                        className="w-full h-full object-contain p-0.5"
                      />
                    ) : (
                      <button
                        className="w-full h-full flex items-center justify-center gap-1 text-[10px] font-medium animate-pulse cursor-pointer hover:bg-blue-50/50 transition-colors"
                        style={{ color: colors.text }}
                        onClick={() => setShowSignaturePad(true)}
                      >
                        <PenLine className="h-3 w-3" />
                        Click to sign
                      </button>
                    )}
                  </>
                )}

                {field.type === "date" && (
                  <div
                    className="w-full h-full flex items-center px-1.5 text-[10px] font-medium"
                    style={{ color: colors.text }}
                  >
                    <Calendar className="h-3 w-3 mr-1 shrink-0" />
                    {todayStr}
                  </div>
                )}

                {field.type === "name" && (
                  <div
                    className="w-full h-full flex items-center px-1.5 text-[10px] font-medium"
                    style={{ color: colors.text }}
                  >
                    <User className="h-3 w-3 mr-1 shrink-0" />
                    {influencerName}
                  </div>
                )}
              </div>
            );
          })}
        </>
      );
    },
    [fields, signatureDataUrl, todayStr, influencerName],
  );

  const hasSignatureFields = fields.some((f) => f.type === "signature");

  return (
    <div className="space-y-4">
      {/* PDF pages */}
      <div className="flex justify-center">
        <PdfAllPages
          pdfUrl={pdfUrl}
          width={700}
          renderPageOverlay={renderPageOverlay}
        />
      </div>

      {/* Signature pad modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Sign Here</h3>
              <button
                onClick={() => setShowSignaturePad(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SignaturePad onSignatureChange={handleSignature} />
          </div>
        </div>
      )}

      {/* Inline signature pad fallback for when there are no signature fields placed */}
      {!hasSignatureFields && (
        <div className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-semibold">Your Signature</h2>
          <SignaturePad onSignatureChange={handleSignature} />
        </div>
      )}
    </div>
  );
}
