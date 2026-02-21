"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function PendingApprovalPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="mb-2 text-lg font-semibold">Account pending approval</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Your account is awaiting admin approval. You will be able to access the
        app once an administrator has approved your request.
      </p>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </Button>
    </div>
  );
}
