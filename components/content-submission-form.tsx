"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  FileVideo,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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
  iban: string;
  routingNumber: string;
  ccCode: string;
  bankAddress: string;
  country: string;
  contactNumber: string;
}

interface UploadedFile {
  gcsPath: string;
  name: string;
  size: number;
  type: string;
}

interface PendingUpload {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  error: string | null;
  xhr: XMLHttpRequest | null;
}

const defaultBank: BankDetails = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  bankCode: "",
  iban: "",
  routingNumber: "",
  ccCode: "",
  bankAddress: "",
  country: "",
  contactNumber: "",
};

const MAX_FILE_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB — direct browser → GCS upload
const MAX_FILE_LABEL = "20 GB";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ContentSubmissionForm({
  token,
  influencerName,
  showVideoLinks,
  showPayment,
  requireScode = false,
  submissionLabel: initialLabel,
}: ContentSubmissionFormProps) {
  const [videoLinks, setVideoLinks] = useState<string[]>([""]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [notes, setNotes] = useState("");
  const [sCode, setSCode] = useState("");
  const [submissionLabel, setSubmissionLabel] = useState(initialLabel ?? "");
  const [bank, setBank] = useState<BankDetails>(defaultBank);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const storageKey = `content_submission_${token}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.videoLinks) && data.videoLinks.length) {
          setVideoLinks(data.videoLinks);
        }
        if (Array.isArray(data.uploadedFiles)) {
          setUploadedFiles(data.uploadedFiles);
        }
        if (typeof data.notes === "string") setNotes(data.notes);
        if (data.bank) setBank({ ...defaultBank, ...data.bank });
      }
    } catch {}
  }, [storageKey]);

  const saveToStorage = useCallback(
    (
      links: string[],
      files: UploadedFile[],
      n: string,
      b: BankDetails,
    ) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ videoLinks: links, uploadedFiles: files, notes: n, bank: b }),
        );
      } catch {}
    },
    [storageKey],
  );

  const addVideoLink = () => {
    const updated = [...videoLinks, ""];
    setVideoLinks(updated);
    saveToStorage(updated, uploadedFiles, notes, bank);
  };

  const removeVideoLink = (index: number) => {
    if (videoLinks.length <= 1) return;
    const updated = videoLinks.filter((_, i) => i !== index);
    setVideoLinks(updated);
    saveToStorage(updated, uploadedFiles, notes, bank);
  };

  const updateVideoLink = (index: number, value: string) => {
    const updated = [...videoLinks];
    updated[index] = value;
    setVideoLinks(updated);
    saveToStorage(updated, uploadedFiles, notes, bank);
  };

  const updateNotes = (value: string) => {
    setNotes(value);
    saveToStorage(videoLinks, uploadedFiles, value, bank);
  };

  const updateBank = (field: keyof BankDetails, value: string) => {
    setBank((prev) => {
      const next = { ...prev, [field]: value };
      saveToStorage(videoLinks, uploadedFiles, notes, next);
      return next;
    });
  };

  const removeUploadedFile = (gcsPath: string) => {
    const updated = uploadedFiles.filter((f) => f.gcsPath !== gcsPath);
    setUploadedFiles(updated);
    saveToStorage(videoLinks, updated, notes, bank);
  };

  const cancelPending = (id: string) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      item?.xhr?.abort();
      return prev.filter((p) => p.id !== id);
    });
  };

  const startUpload = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) {
        setError(
          `Storage limit exceeded — "${file.name}" is ${formatBytes(file.size)}. The maximum size per file is ${MAX_FILE_LABEL}. Please compress the video or split it into smaller files.`,
        );
        return;
      }
      const contentType = file.type || "application/octet-stream";
      if (!contentType.startsWith("video/") && !/\.(mp4|mov|webm|mkv|m4v|3gp|mpeg)$/i.test(file.name)) {
        setError(`"${file.name}" is not a video file. Supported formats: MP4, MOV, WebM, MKV, M4V, 3GP, MPEG.`);
        return;
      }
      setError(null);

      const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const xhr = new XMLHttpRequest();

      setPending((prev) => [
        ...prev,
        {
          id: localId,
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          error: null,
          xhr,
        },
      ]);

      // 1. Ask server for a signed PUT URL
      let uploadUrl: string;
      let gcsPath: string;
      try {
        const res = await fetch("/api/portal/upload-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            fileName: file.name,
            contentType,
            size: file.size,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to start upload");
        }
        const data = (await res.json()) as { uploadUrl: string; gcsPath: string };
        uploadUrl = data.uploadUrl;
        gcsPath = data.gcsPath;
      } catch (err) {
        setPending((prev) =>
          prev.map((p) =>
            p.id === localId
              ? { ...p, error: err instanceof Error ? err.message : "Failed to start upload" }
              : p,
          ),
        );
        return;
      }

      // 2. PUT file directly to GCS via signed URL
      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setPending((prev) =>
          prev.map((p) => (p.id === localId ? { ...p, progress: pct } : p)),
        );
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploaded: UploadedFile = {
            gcsPath,
            name: file.name,
            size: file.size,
            type: contentType,
          };
          setUploadedFiles((prev) => {
            const next = [...prev, uploaded];
            saveToStorage(videoLinks, next, notes, bank);
            return next;
          });
          setPending((prev) => prev.filter((p) => p.id !== localId));
        } else {
          setPending((prev) =>
            prev.map((p) =>
              p.id === localId
                ? { ...p, error: `Upload failed (HTTP ${xhr.status})` }
                : p,
            ),
          );
        }
      });

      xhr.addEventListener("error", () => {
        setPending((prev) =>
          prev.map((p) =>
            p.id === localId
              ? {
                  ...p,
                  error:
                    "Upload blocked. Storage CORS may not be configured — see scripts/configure-gcs-cors.ts",
                }
              : p,
          ),
        );
      });

      xhr.addEventListener("abort", () => {
        // already removed by cancelPending
      });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.send(file);
    },
    [token, videoLinks, notes, bank, saveToStorage],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((f) => startUpload(f));
    },
    [startUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const totalVideoCount =
    videoLinks.filter((l) => l.trim()).length + uploadedFiles.length;
  const hasPendingUploads = pending.some((p) => !p.error);

  const canSubmit = () => {
    if (showVideoLinks && totalVideoCount === 0) return false;
    if (hasPendingUploads) return false;
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
        const cleanLinks = videoLinks.map((l) => l.trim()).filter(Boolean);
        if (cleanLinks.length) payload.videoLinks = cleanLinks;
        if (uploadedFiles.length) payload.videoFiles = uploadedFiles;
      }
      if (notes.trim()) payload.notes = notes.trim();
      if (sCode.trim()) payload.sCode = sCode.trim();
      if (submissionLabel.trim()) payload.submissionLabel = submissionLabel.trim();
      if (showPayment) {
        payload.bankDetails = {
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolder: bank.accountHolder,
          bankCode: bank.bankCode || undefined,
          iban: bank.iban || undefined,
          routingNumber: bank.routingNumber || undefined,
          ccCode: bank.ccCode || undefined,
          bankAddress: bank.bankAddress || undefined,
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
      {/* Video Submissions Section */}
      {showVideoLinks && (
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Submitted Videos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Paste links to your posted videos, upload files directly, or both.
            </p>
          </div>

          <Tabs defaultValue="link" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="link" className="flex-1">
                <Link2 className="mr-1.5 h-4 w-4" />
                Paste Link
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">
                <Upload className="mr-1.5 h-4 w-4" />
                Upload File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-3 mt-4">
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
            </TabsContent>

            <TabsContent value="upload" className="space-y-3 mt-4">
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30",
                )}
              >
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drop video files here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  MP4, MOV, WebM, MKV. Up to {MAX_FILE_LABEL} per file.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* In-progress uploads */}
          {pending.length > 0 && (
            <div className="space-y-2">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="rounded-md border bg-muted/30 p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {p.error ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    )}
                    <span className="flex-1 truncate font-medium">
                      {p.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatBytes(p.fileSize)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => cancelPending(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {p.error ? (
                    <p className="mt-1.5 text-xs text-destructive">{p.error}</p>
                  ) : (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Successfully uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Uploaded Files
              </p>
              {uploadedFiles.map((f) => (
                <div
                  key={f.gcsPath}
                  className="flex items-center gap-2 rounded-md border bg-emerald-50/50 dark:bg-emerald-900/10 p-3"
                >
                  <FileVideo className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium">
                    {f.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatBytes(f.size)}
                  </span>
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeUploadedFile(f.gcsPath)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

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
          {/* S-Code only appears alongside payment — it identifies the
              influencer on the payment form. Non-payment forms hide it. */}
          {showPayment && (
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
          )}
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

          <div>
            <Label htmlFor="iban">IBAN <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="iban"
              type="text"
              placeholder="e.g. DE89370400440532013000"
              value={bank.iban || ""}
              onChange={(e) => updateBank("iban", e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="swiftCode">SWIFT / BIC Code</Label>
              <Input
                id="swiftCode"
                type="text"
                placeholder="e.g. CITIKRSX"
                value={bank.bankCode || ""}
                onChange={(e) => updateBank("bankCode", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="routingNumber">Routing Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="routingNumber"
                type="text"
                placeholder="For US banks"
                value={bank.routingNumber || ""}
                onChange={(e) => updateBank("routingNumber", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ccCode">CC Code <span className="text-muted-foreground font-normal">(country / branch code)</span></Label>
              <Input
                id="ccCode"
                type="text"
                placeholder="e.g. KR, US, branch code"
                value={bank.ccCode || ""}
                onChange={(e) => updateBank("ccCode", e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                type="tel"
                placeholder="+1 234 567 8900"
                value={bank.contactNumber || ""}
                onChange={(e) => updateBank("contactNumber", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="bankAddress">Bank Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              id="bankAddress"
              rows={2}
              placeholder="Bank's physical address"
              value={bank.bankAddress || ""}
              onChange={(e) => updateBank("bankAddress", e.target.value)}
              className="mt-1.5 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          ) : hasPendingUploads ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Waiting for uploads...
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
