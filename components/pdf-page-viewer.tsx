"use client";

import { useCallback, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPageViewerProps {
  pdfUrl: string;
  pageNumber: number;
  width?: number;
  /** Called once when the page finishes rendering */
  onPageLoad?: (dims: { width: number; height: number }) => void;
  /** Overlay content positioned on top of the page */
  children?: React.ReactNode;
  /** Click handler on the page area (coordinates relative to page container) */
  onPageClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function PdfPageViewer({
  pdfUrl,
  pageNumber,
  width = 700,
  onPageLoad,
  children,
  onPageClick,
}: PdfPageViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageHeight, setPageHeight] = useState<number>(0);

  const handleDocLoad = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
    },
    [],
  );

  const handlePageLoad = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      const scale = width / viewport.width;
      const scaledH = viewport.height * scale;
      setPageHeight(scaledH);
      onPageLoad?.({ width, height: scaledH });
    },
    [width, onPageLoad],
  );

  if (numPages !== null && pageNumber > numPages) return null;

  return (
    <div
      className="relative"
      style={{ width, height: pageHeight || "auto" }}
      onClick={onPageClick}
    >
      <Document
        file={pdfUrl}
        onLoadSuccess={handleDocLoad}
        loading={
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            Loading PDF...
          </div>
        }
        error={
          <div className="flex items-center justify-center h-40 text-sm text-destructive">
            Failed to load PDF
          </div>
        }
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          onLoadSuccess={handlePageLoad}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
      {/* Overlay layer for fields */}
      {children && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ width, height: pageHeight || "auto" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Multi-page wrapper ── */
interface PdfAllPagesProps {
  pdfUrl: string;
  width?: number;
  /** Renders overlay content for each page */
  renderPageOverlay?: (pageNumber: number) => React.ReactNode;
  onPageClick?: (pageNumber: number, e: React.MouseEvent<HTMLDivElement>) => void;
}

export function PdfAllPages({
  pdfUrl,
  width = 700,
  renderPageOverlay,
  onPageClick,
}: PdfAllPagesProps) {
  const [numPages, setNumPages] = useState<number>(0);

  return (
    <Document
      file={pdfUrl}
      onLoadSuccess={({ numPages: n }) => setNumPages(n)}
      loading={
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          Loading PDF...
        </div>
      }
      error={
        <div className="flex items-center justify-center h-40 text-sm text-destructive">
          Failed to load PDF
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: numPages }, (_, i) => (
          <PdfPageWithOverlay
            key={i + 1}
            pageNumber={i + 1}
            width={width}
            overlay={renderPageOverlay?.(i + 1)}
            onClick={
              onPageClick
                ? (e: React.MouseEvent<HTMLDivElement>) => onPageClick(i + 1, e)
                : undefined
            }
          />
        ))}
      </div>
    </Document>
  );
}

function PdfPageWithOverlay({
  pageNumber,
  width,
  overlay,
  onClick,
}: {
  pageNumber: number;
  width: number;
  overlay?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const [dims, setDims] = useState({ w: width, h: 0 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLoad = (page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    const scale = width / viewport.width;
    setDims({ w: width, h: viewport.height * scale });
  };

  return (
    <div
      className="relative border border-border rounded shadow-sm bg-white"
      style={{ width, height: dims.h || "auto" }}
      onClick={onClick}
      data-page={pageNumber}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        onLoadSuccess={handleLoad}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />
      {overlay && (
        <div
          className="absolute inset-0"
          style={{ width, height: dims.h || "auto" }}
        >
          {overlay}
        </div>
      )}
    </div>
  );
}
