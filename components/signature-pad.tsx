"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
}

type SignMode = "draw" | "stamp";

export function SignaturePad({ onSignatureChange }: SignaturePadProps) {
  const [mode, setMode] = useState<SignMode>("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [stampProcessing, setStampProcessing] = useState(false);

  // --- Draw mode ---
  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) {
        const touch = e.touches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [],
  );

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      setIsDrawing(true);
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const pos = getPos(e);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    },
    [isDrawing, getPos],
  );

  const endDraw = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setHasDrawn(true);
      const canvas = canvasRef.current;
      if (canvas) {
        onSignatureChange(canvas.toDataURL("image/png"));
      }
    }
  }, [isDrawing, onSignatureChange]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onSignatureChange(null);
  }, [onSignatureChange]);

  // Prevent scrolling while drawing on mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;
    const prevent = (e: TouchEvent) => {
      if (isDrawing) e.preventDefault();
    };
    canvas.addEventListener("touchmove", prevent, { passive: false });
    return () => canvas.removeEventListener("touchmove", prevent);
  }, [isDrawing, mode]);

  // --- Stamp mode ---
  const processStampImage = useCallback(
    async (file: File) => {
      setStampProcessing(true);

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        // Remove white/light background (make transparent)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // If pixel is light (close to white), make it transparent
          if (r > 200 && g > 200 && b > 200) {
            data[i + 3] = 0; // Set alpha to 0
          }
        }
        ctx.putImageData(imageData, 0, 0);

        // Auto-crop to content bounds
        let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const idx = (y * img.width + x) * 4;
            if (data[idx + 3] > 10) { // non-transparent pixel
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        // Add small padding
        const pad = 4;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(img.width - 1, maxX + pad);
        maxY = Math.min(img.height - 1, maxY + pad);

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        if (cropW <= 0 || cropH <= 0) {
          setStampProcessing(false);
          return;
        }

        const croppedData = ctx.getImageData(minX, minY, cropW, cropH);

        // Resize to fit signature field (max 300x150, preserve aspect ratio)
        const maxW = 300, maxH = 150;
        let finalW = cropW, finalH = cropH;
        if (finalW > maxW) {
          finalH = Math.round(finalH * (maxW / finalW));
          finalW = maxW;
        }
        if (finalH > maxH) {
          finalW = Math.round(finalW * (maxH / finalH));
          finalH = maxH;
        }

        const finalCanvas = document.createElement("canvas");
        finalCanvas.width = finalW;
        finalCanvas.height = finalH;
        const fCtx = finalCanvas.getContext("2d")!;

        // Draw cropped content onto a temp canvas first
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        cropCanvas.getContext("2d")!.putImageData(croppedData, 0, 0);

        // Scale to final size
        fCtx.drawImage(cropCanvas, 0, 0, finalW, finalH);

        const result = finalCanvas.toDataURL("image/png");
        setStampPreview(result);
        onSignatureChange(result);
        setStampProcessing(false);
      };

      img.src = url;
    },
    [onSignatureChange],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      processStampImage(file);
    },
    [processStampImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.type === "image/png" || file.type === "image/jpeg")) {
        processStampImage(file);
      }
    },
    [processStampImage],
  );

  const clearStamp = useCallback(() => {
    setStampPreview(null);
    onSignatureChange(null);
  }, [onSignatureChange]);

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("draw");
            clearStamp();
          }}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            mode === "draw"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          Draw Signature
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("stamp");
            clearCanvas();
          }}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            mode === "stamp"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent",
          )}
        >
          Upload Stamp
        </button>
      </div>

      {mode === "draw" ? (
        <div>
          <div className="rounded-lg border-2 border-dashed border-border bg-white">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Draw your signature above using mouse or touch
            </p>
            {hasDrawn && (
              <Button variant="ghost" size="sm" onClick={clearCanvas}>
                <Eraser className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div>
          {stampPreview ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center rounded-lg border border-border bg-white p-6">
                <img
                  src={stampPreview}
                  alt="Stamp preview"
                  className="max-h-[150px] max-w-[300px] object-contain"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Stamp preview (background removed, auto-cropped)
                </p>
                <Button variant="ghost" size="sm" onClick={clearStamp}>
                  <Eraser className="mr-1 h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <label
              className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-muted/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {stampProcessing ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Processing...
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      Drop your stamp image here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG or JPEG. Background will be auto-removed.
                    </p>
                  </div>
                </>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
