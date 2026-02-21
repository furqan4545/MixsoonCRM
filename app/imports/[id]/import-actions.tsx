"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { startSaveImport } from "@/components/save-progress-bar";
import { CloudUpload, Trash2 } from "lucide-react";

export function ImportActions({
  importId,
  status,
  influencerCount,
}: {
  importId: string;
  status: string;
  influencerCount: number;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isDraft = status === "DRAFT";
  const isProcessing = status === "PROCESSING";

  async function handleSaveToCloud() {
    setSaving(true);
    try {
      const res = await fetch(`/api/imports/${importId}/save`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      startSaveImport(importId);
      router.refresh();
    } catch (e) {
      console.error("Save error:", e);
      alert(e instanceof Error ? e.message : "Failed to save to cloud.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(mode: "soft" | "hard") {
    setDeleting(true);
    try {
      const url =
        mode === "hard"
          ? `/api/imports/${importId}/delete-with-data`
          : `/api/imports/${importId}`;

      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setDialogOpen(false);
      router.push("/imports");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {isDraft && (
        <Button
          size="sm"
          onClick={handleSaveToCloud}
          disabled={saving || influencerCount === 0}
        >
          <CloudUpload className="mr-2 h-4 w-4" />
          {saving ? "Saving…" : "Save to cloud"}
        </Button>
      )}
      {isProcessing && (
        <span className="text-sm text-muted-foreground">
          Saving to cloud…
        </span>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Import
          </Button>
        </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Import</DialogTitle>
          <DialogDescription>
            Choose how you want to delete this import. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Soft Delete */}
          <div className="rounded-lg border p-4">
            <h4 className="text-sm font-semibold">
              Remove import record only
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Deletes the import entry but keeps all {influencerCount}{" "}
              influencers and their videos in the database. The influencers
              will be unlinked from this import.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => handleDelete("soft")}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Import Only"}
            </Button>
          </div>

          {/* Hard Delete */}
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <h4 className="text-sm font-semibold text-destructive">
              Delete everything
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently deletes the import, all {influencerCount} linked
              influencers, and all their videos. This cannot be reversed.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3"
              onClick={() => handleDelete("hard")}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Import + All Data"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
}
