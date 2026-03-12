"use client";

import { useCallback, useEffect, useState } from "react";
import { type ContractField, FIELD_COLORS } from "@/app/lib/contract-fields";
import { PdfAllPages } from "@/components/pdf-page-viewer";
import { SignaturePad } from "@/components/signature-pad";
import { PenLine, X } from "lucide-react";

interface PdfSignerViewProps {
  pdfUrl: string;
  fields: ContractField[];
  influencerName: string;
  /** Called whenever field values change — parent gets the full map */
  onFieldValuesChange: (values: Record<string, string>) => void;
}

export function PdfSignerView({
  pdfUrl,
  fields,
  influencerName,
  onFieldValuesChange,
}: PdfSignerViewProps) {
  // Per-field values: { fieldId: value (dataUrl for signatures, text for name/date) }
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [signingFieldId, setSigningFieldId] = useState<string | null>(null);

  // Notify parent whenever field values change
  useEffect(() => {
    onFieldValuesChange(fieldValues);
  }, [fieldValues, onFieldValuesChange]);

  const setFieldValue = useCallback((fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSignature = useCallback(
    (dataUrl: string | null) => {
      if (signingFieldId && dataUrl) {
        setFieldValue(signingFieldId, dataUrl);
      }
      setSigningFieldId(null);
    },
    [signingFieldId, setFieldValue],
  );

  const renderPageOverlay = useCallback(
    (pageNumber: number) => {
      const pageFields = fields.filter((f) => f.page === pageNumber);
      return (
        <>
          {pageFields.map((field) => {
            const colors = FIELD_COLORS[field.type];
            const value = fieldValues[field.id] || "";

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
                  backgroundColor: value ? "rgba(255,255,255,0.95)" : colors.bg,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                {/* ── Signature field ── */}
                {field.type === "signature" && (
                  <>
                    {value ? (
                      <div className="relative w-full h-full group">
                        <img
                          src={value}
                          alt="Signature"
                          className="w-full h-full object-contain p-0.5"
                        />
                        {/* Re-sign button on hover */}
                        <button
                          className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={() => setSigningFieldId(field.id)}
                        >
                          <PenLine className="h-3 w-3 mr-1" />
                          Re-sign
                        </button>
                      </div>
                    ) : (
                      <button
                        className="w-full h-full flex items-center justify-center gap-1 text-[10px] font-medium animate-pulse cursor-pointer hover:bg-blue-50/50 transition-colors"
                        style={{ color: colors.text }}
                        onClick={() => setSigningFieldId(field.id)}
                      >
                        <PenLine className="h-3 w-3" />
                        Click to sign
                      </button>
                    )}
                  </>
                )}

                {/* ── Name field — editable input ── */}
                {field.type === "name" && (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setFieldValue(field.id, e.target.value)}
                    placeholder="Type name here"
                    className="w-full h-full px-1.5 text-[11px] font-medium bg-transparent outline-none placeholder:text-purple-400/60"
                    style={{ color: "#1a1a1a" }}
                  />
                )}

                {/* ── Date field — editable input ── */}
                {field.type === "date" && (
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setFieldValue(field.id, e.target.value)}
                    placeholder="Type date here"
                    className="w-full h-full px-1.5 text-[11px] font-medium bg-transparent outline-none placeholder:text-green-400/60"
                    style={{ color: "#1a1a1a" }}
                  />
                )}
              </div>
            );
          })}
        </>
      );
    },
    [fields, fieldValues, setFieldValue],
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

      {/* Signature pad modal — opens for the specific field clicked */}
      {signingFieldId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Sign Here</h3>
              <button
                onClick={() => setSigningFieldId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SignaturePad onSignatureChange={handleSignature} />
          </div>
        </div>
      )}

      {/* Inline signature pad fallback when no signature fields placed */}
      {!hasSignatureFields && (
        <div className="rounded-lg border border-border p-6">
          <h2 className="mb-4 text-lg font-semibold">Your Signature</h2>
          <SignaturePad
            onSignatureChange={(dataUrl) => {
              if (dataUrl) {
                setFieldValues((prev) => ({ ...prev, __fallback_signature: dataUrl }));
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
