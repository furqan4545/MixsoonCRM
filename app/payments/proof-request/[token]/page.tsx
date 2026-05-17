"use client";

import { use, useEffect, useState } from "react";
import { Loader2, FileText, AlertTriangle, CheckCircle2, Mailbox } from "lucide-react";

type Summary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  bankName: string | null;
  paidAt: string | null;
  proofRequestedAt: string | null;
  proofSentAt: string | null;
  proofSentMessage: string | null;
  proofFilesCount: number;
  influencer: { username: string; displayName: string | null; email: string | null };
  campaign: { name: string } | null;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; payment: Summary }
  | { kind: "requested"; payment: Summary }
  | { kind: "sent"; payment: Summary }
  | { kind: "invalid" }
  | { kind: "expired" };

export default function ProofRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const resolveState = (payment: Summary): State => {
    if (payment.proofSentAt) return { kind: "sent", payment };
    if (payment.proofRequestedAt) return { kind: "requested", payment };
    return { kind: "ready", payment };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/payments/proof-request/${token}`);
        if (cancelled) return;
        if (res.status === 404) return setState({ kind: "invalid" });
        if (res.status === 410) return setState({ kind: "expired" });
        if (!res.ok) return setState({ kind: "invalid" });
        const payment: Summary = await res.json();
        setState(resolveState(payment));
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleRequest = async () => {
    if (submitting || state.kind !== "ready") return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/payments/proof-request/${token}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setState({
          kind: "requested",
          payment: { ...state.payment, proofRequestedAt: data.requestedAt },
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 flex items-start justify-center">
      <div className="w-full max-w-md rounded-xl border bg-white shadow-sm p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-md bg-stone-900 text-white flex items-center justify-center text-sm font-bold">
            M
          </div>
          <div>
            <p className="text-sm font-semibold">MIXSOON</p>
            <p className="text-[11px] text-stone-500">Proof of payment</p>
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-stone-600 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading payment details…</span>
          </div>
        )}

        {state.kind === "invalid" && (
          <Info
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            title="Link not found"
            body="This link is invalid. If you believe this is a mistake, please contact the brand team that sent you this email."
          />
        )}

        {state.kind === "expired" && (
          <Info
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            title="Link expired"
            body="This link has expired. Please reach out to the brand team and ask them to re-send the payment notification."
          />
        )}

        {state.kind === "ready" && (
          <>
            <p className="text-sm text-stone-600 mb-4">
              Hi
              {state.payment.influencer.displayName
                ? ` ${state.payment.influencer.displayName}`
                : ` @${state.payment.influencer.username}`}{" "}
              — if you need proof of this payment (a receipt, transfer screenshot, or
              accounting document), let the brand team know and they'll email it to you.
            </p>
            <Card payment={state.payment} />
            <button
              type="button"
              onClick={handleRequest}
              disabled={submitting}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending request…
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Request proof of payment
                </>
              )}
            </button>
          </>
        )}

        {state.kind === "requested" && (
          <Info
            icon={<Mailbox className="h-5 w-5 text-blue-600" />}
            title="Request submitted"
            body={`Your request was sent${
              state.payment.proofRequestedAt
                ? ` on ${new Date(state.payment.proofRequestedAt).toLocaleDateString()}`
                : ""
            }. The brand team will email the proof to ${
              state.payment.influencer.email ?? "your email"
            } shortly.`}
            payment={state.payment}
          />
        )}

        {state.kind === "sent" && (
          <Info
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            title="Proof already sent"
            body={`Proof of payment was emailed${
              state.payment.proofSentAt
                ? ` on ${new Date(state.payment.proofSentAt).toLocaleDateString()}`
                : ""
            } to ${state.payment.influencer.email ?? "your email"}. Check your inbox (and spam folder).`}
            payment={state.payment}
          />
        )}
      </div>
    </div>
  );
}

function Card({ payment }: { payment: Summary }) {
  return (
    <div className="rounded-lg border bg-stone-50 px-4 py-3 text-sm">
      <Row label="Amount" value={`${payment.amount.toLocaleString()} ${payment.currency}`} bold />
      <Row label="Status" value={payment.status} />
      {payment.campaign && <Row label="Campaign" value={payment.campaign.name} />}
      {payment.bankName && <Row label="Bank" value={payment.bankName} />}
      {payment.paidAt && <Row label="Sent" value={new Date(payment.paidAt).toLocaleDateString()} />}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-b-0 border-stone-200">
      <span className="text-stone-500">{label}</span>
      <span className={bold ? "font-semibold text-stone-900" : "text-stone-800"}>{value}</span>
    </div>
  );
}

function Info({
  icon,
  title,
  body,
  payment,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  payment?: Summary;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <div className="mt-0.5">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="text-sm text-stone-600 mt-1">{body}</p>
        </div>
      </div>
      {payment && <Card payment={payment} />}
    </div>
  );
}
