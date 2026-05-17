"use client";

import { use, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type PaymentSummary = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  bankName: string | null;
  paidAt: string | null;
  confirmedAt: string | null;
  alreadyConfirmedByTeam: boolean;
  confirmedByEmail: string | null;
  influencer: { username: string; displayName: string | null; email: string | null };
  campaign: { name: string } | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; payment: PaymentSummary }
  | { kind: "already"; payment: PaymentSummary }
  | { kind: "invalid" }
  | { kind: "expired" };

export default function ConfirmPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ confirmedAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/payments/confirm/${token}`);
        if (cancelled) return;
        if (res.status === 404) return setState({ kind: "invalid" });
        if (res.status === 410) return setState({ kind: "expired" });
        if (!res.ok) return setState({ kind: "invalid" });
        const payment: PaymentSummary = await res.json();
        if (payment.status === "RECEIVED") {
          setState({ kind: "already", payment });
        } else {
          setState({ kind: "ready", payment });
        }
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/payments/confirm/${token}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDone({ confirmedAt: data.confirmedAt ?? new Date().toISOString() });
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
            <p className="text-[11px] text-stone-500">Payment confirmation</p>
          </div>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-stone-600 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading payment details…</span>
          </div>
        )}

        {state.kind === "invalid" && (
          <InfoBlock
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            title="Link not found"
            body="This confirmation link is invalid or has already been used. If you believe this is a mistake, please contact the brand team that sent you this email."
          />
        )}

        {state.kind === "expired" && (
          <InfoBlock
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            title="Link expired"
            body="This confirmation link has expired. Please reach out to the brand team and ask them to re-send the payment notification."
          />
        )}

        {state.kind === "already" && (
          <InfoBlock
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            title="Already confirmed"
            body={
              state.payment.alreadyConfirmedByTeam && state.payment.confirmedByEmail
                ? `This payment was marked as received by the brand team (${state.payment.confirmedByEmail}). No further action needed.`
                : "This payment is already marked as received. Thanks!"
            }
            payment={state.payment}
          />
        )}

        {state.kind === "ready" && !done && (
          <>
            <p className="text-sm text-stone-600 mb-4">
              Hi
              {state.payment.influencer.displayName
                ? ` ${state.payment.influencer.displayName}`
                : ` @${state.payment.influencer.username}`}{" "}
              — please confirm you received the following payment.
            </p>
            <PaymentCard payment={state.payment} />
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Yes, I received this payment
                </>
              )}
            </button>
            <p className="mt-3 text-[11px] text-stone-500 text-center">
              Only click if your bank has shown the deposit. This action closes the payment.
            </p>
          </>
        )}

        {state.kind === "ready" && done && (
          <InfoBlock
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            title="Receipt confirmed"
            body="Thank you — the brand team has been notified. You can close this page."
            payment={state.payment}
          />
        )}
      </div>
    </div>
  );
}

function PaymentCard({ payment }: { payment: PaymentSummary }) {
  return (
    <div className="rounded-lg border bg-stone-50 px-4 py-3 text-sm">
      <Row label="Amount" value={`${payment.amount.toLocaleString()} ${payment.currency}`} bold />
      {payment.campaign && <Row label="Campaign" value={payment.campaign.name} />}
      {payment.bankName && <Row label="Bank" value={payment.bankName} />}
      {payment.paidAt && (
        <Row label="Sent" value={new Date(payment.paidAt).toLocaleDateString()} />
      )}
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

function InfoBlock({
  icon,
  title,
  body,
  payment,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  payment?: PaymentSummary;
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
      {payment && <PaymentCard payment={payment} />}
    </div>
  );
}
