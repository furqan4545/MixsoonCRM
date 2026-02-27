import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { EmailAccountRequired } from "@/components/email-account-required";
import { EmailList } from "@/components/email-list";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!account) {
    return (
      <EmailAccountRequired message="Connect an email account first to open your inbox." />
    );
  }

  return <EmailList folder="INBOX" title="Inbox" />;
}
