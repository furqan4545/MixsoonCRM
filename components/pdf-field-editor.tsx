"use client";

import { useCallback, useRef, useState } from "react";
import {
  type ContractField,
  FIELD_COLORS,
  FIELD_DEFAULTS,
  generateFieldId,
} from "@/app/lib/contract-fields";
import { PdfAllPages } from "@/components/pdf-page-viewer";
import { Button } from "@/components/ui/button";
import {
  PenLine,
  Calendar,
  User,
  Trash2,
  GripVertical,
} from "lucide-react";

interface PdfFieldEditorProps {
  pdfUrl: string;
  pageCount: number;
  fields: ContractField[];
  onFieldsChange: (fields: ContractField[]) => void;
}

type PlacingMode = ContractField["type"] | null;

export function PdfFieldEditor({
  pdfUrl,
  fields,
  onFieldsChange,
}: PdfFieldEditorProps) {
  const [placingMode, setPlacingMode] = useState<PlacingMode>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const dragRef = useRef<{
    fieldId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Place a new field on click
  const handlePageClick = useCallback(
    (pageNumber: number, e: React.MouseEvent<HTMLDivElement>) => {
      if (!placingMode) return;

      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;

      const defaults = FIELD_DEFAULTS[placingMode];
      const newField: ContractField = {
        id: generateFieldId(placingMode),
        type: placingMode,
        page: pageNumber,
        x: Math.max(0, Math.min(100 - defaults.width, xPct - defaults.width / 2)),
        y: Math.max(0, Math.min(100 - defaults.height, yPct - defaults.height / 2)),
        width: defaults.width,
        height: defaults.height,
      };

      onFieldsChange([...fields, newField]);
      setPlacingMode(null);
      setSelectedFieldId(newField.id);
    },
    [placingMode, fields, onFieldsChange],
  );

  const deleteField = useCallback(
    (id: string) => {
      onFieldsChange(fields.filter((f) => f.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
    },
    [fields, onFieldsChange, selectedFieldId],
  );

  // Drag handling
  const handleDragStart = useCallback(
    (fieldId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const field = fields.find((f) => f.id === fieldId);
      if (!field) return;

      setSelectedFieldId(fieldId);
      dragRef.current = {
        fieldId,
        startX: e.clientX,
        startY: e.clientY,
        origX: field.x,
        origY: field.y,
      };

      const handleMove = (me: MouseEvent) => {
        if (!dragRef.current) return;
        const dr = dragRef.current;
        // Find the page container
        const pageEl = document.querySelector(
          `[data-page="${field.page}"]`,
        ) as HTMLElement | null;
        if (!pageEl) return;

        const rect = pageEl.getBoundingClientRect();
        const dxPct = ((me.clientX - dr.startX) / rect.width) * 100;
        const dyPct = ((me.clientY - dr.startY) / rect.height) * 100;

        const newX = Math.max(
          0,
          Math.min(100 - field.width, dr.origX + dxPct),
        );
        const newY = Math.max(
          0,
          Math.min(100 - field.height, dr.origY + dyPct),
        );

        onFieldsChange(
          fields.map((f) =>
            f.id === fieldId ? { ...f, x: newX, y: newY } : f,
          ),
        );
      };

      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [fields, onFieldsChange],
  );

  // Render overlay for a page
  const renderPageOverlay = useCallback(
    (pageNumber: number) => {
      const pageFields = fields.filter((f) => f.page === pageNumber);
      return (
        <>
          {pageFields.map((field) => {
            const colors = FIELD_COLORS[field.type];
            const defaults = FIELD_DEFAULTS[field.type];
            const isSelected = selectedFieldId === field.id;
            return (
              <div
                key={field.id}
                className="absolute pointer-events-auto cursor-move select-none group"
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  border: `2px dashed ${colors.border}`,
                  backgroundColor: colors.bg,
                  borderRadius: 4,
                  boxShadow: isSelected
                    ? `0 0 0 2px ${colors.border}`
                    : undefined,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFieldId(field.id);
                }}
                onMouseDown={(e) => handleDragStart(field.id, e)}
              >
                <div className="flex items-center gap-1 px-1.5 h-full text-[10px] font-medium whitespace-nowrap overflow-hidden"
                  style={{ color: colors.text }}
                >
                  <GripVertical className="h-3 w-3 shrink-0 opacity-50" />
                  {defaults.label}
                </div>
                {/* Delete button */}
                <button
                  className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteField(field.id);
                  }}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
          {/* Placement cursor overlay */}
          {placingMode && (
            <div className="absolute inset-0 cursor-crosshair" />
          )}
        </>
      );
    },
    [fields, selectedFieldId, placingMode, handleDragStart, deleteField],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground mr-1">
          Add field:
        </span>
        <Button
          type="button"
          variant={placingMode === "signature" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setPlacingMode(placingMode === "signature" ? null : "signature")
          }
        >
          <PenLine className="mr-1.5 h-3.5 w-3.5" />
          Signature
        </Button>
        <Button
          type="button"
          variant={placingMode === "date" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setPlacingMode(placingMode === "date" ? null : "date")
          }
        >
          <Calendar className="mr-1.5 h-3.5 w-3.5" />
          Date
        </Button>
        <Button
          type="button"
          variant={placingMode === "name" ? "default" : "outline"}
          size="sm"
          onClick={() =>
            setPlacingMode(placingMode === "name" ? null : "name")
          }
        >
          <User className="mr-1.5 h-3.5 w-3.5" />
          Name
        </Button>

        {placingMode && (
          <span className="text-xs text-muted-foreground ml-2 animate-pulse">
            Click on the PDF to place the {placingMode} field
          </span>
        )}

        {fields.length > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {fields.length} field{fields.length !== 1 ? "s" : ""} placed
          </span>
        )}
      </div>

      {/* PDF pages */}
      <div className="flex justify-center">
        <PdfAllPages
          pdfUrl={pdfUrl}
          width={700}
          renderPageOverlay={renderPageOverlay}
          onPageClick={handlePageClick}
        />
      </div>
    </div>
  );
}
