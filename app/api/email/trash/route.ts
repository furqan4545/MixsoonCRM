import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import { deleteEmailAttachments } from "@/app/lib/email-attachments";

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trashEmails = await prisma.emailMessage.findMany({
    where: { folder: "TRASH", account: { userId: user.id } },
    select: { id: true, accountId: true },
  });

  for (const email of trashEmails) {
    await deleteEmailAttachments(email.accountId, email.id);
  }

  const deleted = await prisma.emailMessage.deleteMany({
    where: { folder: "TRASH", account: { userId: user.id } },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
