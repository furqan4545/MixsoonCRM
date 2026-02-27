"use client";

import { Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmailAccountRequired } from "@/components/email-account-required";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SignatureResponse = {
  text?: string;
  imageDataUrl?: string | null;
  error?: string;
};

export function EmailSignatureForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noAccount, setNoAccount] = useState(false);
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const loadSignature = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/signature", { cache: "no-store" });
      if (res.status === 404) {
        setNoAccount(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load signature");
      const data = (await res.json()) as SignatureResponse;
      setNoAccount(false);
      setText(data.text ?? "");
      setImageDataUrl(data.imageDataUrl ?? null);
    } catch {
      toast.error("Failed to load signature");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSignature();
  }, [loadSignature]);

  const handlePickImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataUrl) {
      toast.error("Failed to read image");
      return;
    }
    setImageDataUrl(dataUrl);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/email/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          imageDataUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SignatureResponse;
      if (!res.ok) throw new Error(data.error ?? "Failed to save signature");
      toast.success("Signature saved");
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save signature",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete your saved signature?")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/email/signature", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete signature");
      setText("");
      setImageDataUrl(null);
      toast.success("Signature deleted");
    } catch {
      toast.error("Failed to delete signature");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto h-full max-w-3xl p-6 text-sm text-muted-foreground">
        Loading signature...
      </div>
    );
  }

  if (noAccount) {
    return (
      <EmailAccountRequired
        title="Signature"
        message="Connect an email account first to manage signatures."
      />
    );
  }

  return (
    <div className="mx-auto h-full max-w-3xl space-y-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signature</h1>
        <p className="text-sm text-muted-foreground">
          Save one signature with custom text and an optional picture.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signature Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Signature Text</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Best regards,\nYour name"}
              rows={8}
            />
          </div>

          <div className="space-y-2">
            <Label>Signature Image (optional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
              {imageDataUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setImageDataUrl(null)}
                >
                  Remove Image
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void handlePickImage(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {imageDataUrl && (
              <div className="rounded-md border p-3">
                <img
                  src={imageDataUrl}
                  alt="Signature preview"
                  className="max-h-36 max-w-[220px] rounded object-contain"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {imageDataUrl && (
            <img
              src={imageDataUrl}
              alt="Signature preview"
              className="max-h-36 max-w-[220px] rounded object-contain"
            />
          )}
          <div className="whitespace-pre-wrap text-sm">{text || "(empty)"}</div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || deleting}>
          {saving ? "Saving..." : "Save Signature"}
        </Button>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={saving || deleting}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deleting ? "Deleting..." : "Delete Signature"}
        </Button>
      </div>
    </div>
  );
}
