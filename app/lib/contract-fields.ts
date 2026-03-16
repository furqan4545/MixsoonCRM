/**
 * Shared types and helpers for DocuSign-style PDF contract fields.
 */

export interface ContractField {
  id: string;
  type: "signature" | "date" | "name" | "stamp";
  page: number; // 1-based
  x: number; // % from left (0-100)
  y: number; // % from top (0-100)
  width: number; // % of page width
  height: number; // % of page height
}

/** Default sizes for each field type (percentages of page) */
export const FIELD_DEFAULTS: Record<
  ContractField["type"],
  { width: number; height: number; label: string }
> = {
  signature: { width: 20, height: 5, label: "Signature" },
  date: { width: 15, height: 3, label: "Date" },
  name: { width: 20, height: 3, label: "Name" },
  stamp: { width: 12, height: 8, label: "Stamp" },
};

/** Colours for field types (border / bg) */
export const FIELD_COLORS: Record<
  ContractField["type"],
  { border: string; bg: string; text: string }
> = {
  signature: {
    border: "#3b82f6",
    bg: "rgba(59,130,246,0.10)",
    text: "#2563eb",
  },
  date: { border: "#10b981", bg: "rgba(16,185,129,0.10)", text: "#059669" },
  name: { border: "#8b5cf6", bg: "rgba(139,92,246,0.10)", text: "#7c3aed" },
  stamp: { border: "#f59e0b", bg: "rgba(245,158,11,0.10)", text: "#d97706" },
};

/**
 * Convert browser percentage coordinates (origin: top-left) to
 * pdf-lib absolute coordinates (origin: bottom-left, in PDF points).
 */
export function percentToPdfCoords(
  field: ContractField,
  pageWidth: number,
  pageHeight: number,
) {
  const absX = (field.x / 100) * pageWidth;
  const absW = (field.width / 100) * pageWidth;
  const absH = (field.height / 100) * pageHeight;
  // PDF origin is bottom-left, browser origin is top-left → flip Y
  const absY =
    pageHeight - ((field.y + field.height) / 100) * pageHeight;

  return { x: absX, y: absY, width: absW, height: absH };
}

let _idCounter = 0;
export function generateFieldId(type: ContractField["type"]): string {
  _idCounter += 1;
  return `${type}-${Date.now()}-${_idCounter}`;
}
