import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { EmailAccountRequired } from "@/components/email-account-required";
import { EmailCompose } from "@/components/email-compose";

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!account) {
    return (
      <EmailAccountRequired message="Connect an email account first to compose email." />
    );
  }

  let accountSignature: string | undefined;
  try {
    const rows = await prisma.$queryRaw<Array<{ signature: string | null }>>`
      SELECT "signature"
      FROM "EmailAccount"
      WHERE "id" = ${account.id}
      LIMIT 1
    `;
    accountSignature = rows[0]?.signature ?? undefined;
  } catch {
    accountSignature = undefined;
  }

  return (
    <EmailCompose
      defaultTo={firstParam(params.to)}
      defaultSubject={firstParam(params.subject)}
      influencerId={firstParam(params.influencerId)}
      inReplyTo={firstParam(params.inReplyTo)}
      accountSignature={accountSignature}
    />
  );
}
