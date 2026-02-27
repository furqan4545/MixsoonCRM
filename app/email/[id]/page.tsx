import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { EmailAccountRequired } from "@/components/email-account-required";
import { EmailDetail } from "@/components/email-detail";

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!account) {
    return (
      <EmailAccountRequired message="Connect an email account first to view email details." />
    );
  }

  const { id } = await params;
  return <EmailDetail emailId={id} />;
}
