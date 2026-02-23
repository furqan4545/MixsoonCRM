"use client";

import { useSearchParams } from "next/navigation";
import { EmailCompose } from "@/components/email-compose";

export default function ComposePage() {
  const params = useSearchParams();

  return (
    <EmailCompose
      defaultTo={params.get("to") ?? undefined}
      defaultSubject={params.get("subject") ?? undefined}
      influencerId={params.get("influencerId") ?? undefined}
      inReplyTo={params.get("inReplyTo") ?? undefined}
    />
  );
}
