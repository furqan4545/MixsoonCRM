import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { EmailAccountForm } from "@/components/email-account-form";

export default async function EmailSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
    select: {
      emailAddress: true,
      smtpHost: true,
      smtpPort: true,
      imapHost: true,
      imapPort: true,
    },
  });

  return <EmailAccountForm existing={account} />;
}
