"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbnailImage } from "@/components/thumbnail-image";

type PendingUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

type PendingEvaluation = {
  id: string;
  score: number | null;
  bucket: "APPROVED" | "OKISH" | "REJECTED";
  reasons: string | null;
  influencer: {
    id: string;
    username: string;
    avatarUrl: string | null;
    followers: number | null;
    email: string | null;
  };
  run: {
    id: string;
    campaign: { id: string; name: string };
  };
};

function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}

function formatNumber(n: number | null): string {
  if (n == null) return "\u2014";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function ApprovalsPage() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [evaluations, setEvaluations] = useState<PendingEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, queuesRes] = await Promise.all([
        fetch("/api/admin/users").then((r) =>
          r.ok ? r.json() : { users: [] },
        ),
        fetch("/api/ai/queues").then((r) => (r.ok ? r.json() : [])),
      ]);
      const users = Array.isArray(usersRes.users) ? usersRes.users : [];
      setPendingUsers(
        users.filter((u: { status: string }) => u.status === "PENDING"),
      );
      setEvaluations(
        Array.isArray(queuesRes)
          ? queuesRes.filter(
              (e: PendingEvaluation) => e.bucket === "APPROVED",
            )
          : [],
      );
    } catch {
      console.error("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approveUser(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      if (res.ok) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function rejectUser(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SUSPENDED" }),
      });
      if (res.ok) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } finally {
      setUpdatingId(null);
    }
  }

  const totalPending = pendingUsers.length + evaluations.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Items that need your review and approval.
        </p>
      </div>

      {totalPending === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="font-medium">All caught up!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No items pending approval right now.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Users */}
          {pendingUsers.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Pending Users
                </h2>
                <Badge variant="secondary">{pendingUsers.length}</Badge>
              </div>
              <div className="space-y-2">
                {pendingUsers.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-xl border bg-card p-4"
                  >
                    <div>
                      <p className="font-medium">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.name ?? "No name"} &middot; Registered{" "}
                        {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={updatingId === u.id}
                        onClick={() => approveUser(u.id)}
                      >
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={updatingId === u.id}
                        onClick={() => rejectUser(u.id)}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AI-Approved Influencers */}
          {evaluations.length > 0 && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  AI-Approved Influencers
                </h2>
                <Badge variant="secondary">{evaluations.length}</Badge>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Influencers approved by AI filtering, ready for campaign
                assignment.
              </p>
              <div className="space-y-2">
                {evaluations.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-4 rounded-xl border bg-card p-4"
                  >
                    {ev.influencer.avatarUrl ? (
                      <ThumbnailImage
                        src={fixThumbnailUrl(ev.influencer.avatarUrl)!}
                        alt={ev.influencer.username}
                        className="h-10 w-10 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                        {ev.influencer.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/influencers/${ev.influencer.id}`}
                          className="font-medium hover:underline"
                        >
                          @{ev.influencer.username}
                        </Link>
                        <Badge variant="outline" className="text-xs">
                          Score: {ev.score ?? "\u2014"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatNumber(ev.influencer.followers)} followers
                        </span>
                        <span>Campaign: {ev.run.campaign.name}</span>
                      </div>
                    </div>
                    <Link href="/campaigns">
                      <Button size="sm" variant="outline">
                        Assign to Campaign
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
