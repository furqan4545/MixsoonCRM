import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";

export default async function EmailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });

  if (!account) {
    redirect("/email/settings");
  }

  redirect("/email/inbox");
}
