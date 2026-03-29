"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function ImportActions({
  importId,
  status,
  influencerCount,
  influencerIds,
}: {
  importId: string;
  status: string;
  influencerCount: number;
  influencerIds: string[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // PIC assignment
  const [picUsers, setPicUsers] = useState<{ id: string; name: string | null; email: string; role: string }[] | null>(null);
  const [assigning, setAssigning] = useState(false);

  const fetchPicUsers = useCallback(async () => {
    if (picUsers) return;
    try {
      const res = await fetch("/api/users");
      if (res.ok) setPicUsers(await res.json());
    } catch {}
  }, [picUsers]);

  const assignPic = async (userId: string) => {
    if (influencerIds.length === 0) return;
    setAssigning(true);
    try {
      const res = await fetch("/api/influencers/pics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerIds, userIds: [userId] }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(data.message);
    } catch {
      toast.error("Failed to assign PIC");
    } finally {
      setAssigning(false);
    }
  };

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
      {/* Assign PIC to all influencers in this import */}
      <DropdownMenu onOpenChange={(open) => open && fetchPicUsers()}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={assigning || influencerCount === 0}>
            <UserPlus className="mr-2 h-4 w-4" />
            {assigning ? "Assigning..." : "Assign PIC"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
          {!picUsers && <DropdownMenuItem disabled>Loading users...</DropdownMenuItem>}
          {picUsers && picUsers.length === 0 && <DropdownMenuItem disabled>No users found</DropdownMenuItem>}
          {picUsers?.map((u) => (
            <DropdownMenuItem key={u.id} onClick={() => assignPic(u.id)}>
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">
                  {(u.name ?? u.email).charAt(0).toUpperCase()}
                </div>
                <span>{u.name ?? u.email}</span>
                <span className="text-[10px] text-muted-foreground">{u.role}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
            <div className="rounded-lg border p-4">
              <h4 className="text-sm font-semibold">
                Remove import record only
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Deletes the import entry but keeps all {influencerCount}{" "}
                influencers and their videos in the database.
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
