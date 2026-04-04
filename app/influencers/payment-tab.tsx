"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, CreditCard, MapPin, Phone, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface OnboardingData {
  exists: boolean;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  bankCode?: string;
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  submittedAt?: string;
}

export default function PaymentTab({ influencerId }: { influencerId: string }) {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/onboarding?influencerId=${influencerId}`);
      if (res.ok) setData(await res.json());
    } catch {
      toast.error("Failed to load payment details");
    } finally {
      setLoading(false);
    }
  }, [influencerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const requestDetails = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/payments/request-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencerId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to send request");
        return;
      }
      toast.success("Payment details form sent to influencer");
    } catch {
      toast.error("Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.exists) {
    return (
      <div className="text-center py-8 space-y-3">
        <CreditCard className="h-8 w-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No payment details submitted yet</p>
        <Button size="sm" onClick={requestDetails} disabled={requesting}>
          {requesting ? (
            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</>
          ) : (
            <><Send className="h-3 w-3 mr-1" />Request Payment Details</>
          )}
        </Button>
      </div>
    );
  }

  const fields = [
    { label: "Bank / Payment Method", value: data.bankName, icon: Building2 },
    { label: "Account Number / Payment ID", value: data.accountNumber, icon: CreditCard },
    { label: "Account Holder Name", value: data.accountHolder, icon: null },
    { label: "SWIFT / BIC Code", value: data.bankCode, icon: null },
  ];

  const addressFields = [
    { label: "Full Name", value: data.fullName },
    { label: "Address Line 1", value: data.addressLine1 },
    { label: "Address Line 2", value: data.addressLine2 },
    { label: "City", value: data.city },
    { label: "Postal Code", value: data.postalCode },
    { label: "Country", value: data.country },
  ];

  return (
    <div className="space-y-6">
      {/* Payment Details */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          Payment Details
        </h3>
        <div className="border rounded-lg divide-y">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className={`text-sm ${f.value ? "font-medium" : "text-muted-foreground italic"}`}>
                {f.value || "Not provided"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping Address */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Shipping Address
        </h3>
        <div className="border rounded-lg divide-y">
          {addressFields.map((f) => (
            <div key={f.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className={`text-sm ${f.value ? "font-medium" : "text-muted-foreground italic"}`}>
                {f.value || "Not provided"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Submitted date */}
      {data.submittedAt && (
        <p className="text-xs text-muted-foreground">
          Submitted: {new Date(data.submittedAt).toLocaleDateString()}
        </p>
      )}

      {/* Request updated details */}
      <Button size="sm" variant="outline" onClick={requestDetails} disabled={requesting}>
        {requesting ? (
          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sending...</>
        ) : (
          <><Send className="h-3 w-3 mr-1" />Request Updated Details</>
        )}
      </Button>
    </div>
  );
}
