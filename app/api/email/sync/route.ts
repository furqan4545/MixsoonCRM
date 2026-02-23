import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import { fetchEmailsFromImap } from "@/app/lib/email";
import type { EmailFolder } from "@prisma/client";

const SYNC_FOLDERS: { remote: string; local: EmailFolder }[] = [
  { remote: "INBOX", local: "INBOX" },
  { remote: "SENT", local: "SENT" },
  { remote: "DRAFTS", local: "DRAFTS" },
  { remote: "SPAM", local: "SPAM" },
  { remote: "TRASH", local: "TRASH" },
];

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "No email account connected" }, { status: 404 });
  }

  const since = account.lastSyncAt ?? undefined;
  let totalSynced = 0;

  for (const { remote, local } of SYNC_FOLDERS) {
    try {
      const emails = await fetchEmailsFromImap(account, remote, since);

      for (const email of emails) {
        const existingByMessageId = email.messageId
          ? await prisma.emailMessage.findFirst({
              where: { accountId: account.id, messageId: email.messageId },
            })
          : null;

        if (existingByMessageId) continue;

        await prisma.emailMessage.create({
          data: {
            accountId: account.id,
            messageId: email.messageId ?? undefined,
            inReplyTo: email.inReplyTo ?? undefined,
            from: email.from,
            to: email.to,
            cc: email.cc,
            subject: email.subject,
            bodyHtml: email.bodyHtml ?? undefined,
            bodyText: email.bodyText ?? undefined,
            folder: local,
            isRead: local !== "INBOX",
            receivedAt: email.date ?? new Date(),
            threadId: email.inReplyTo ?? email.messageId ?? undefined,
          },
        });
        totalSynced++;
      }
    } catch (err) {
      console.error(`[email-sync] Error syncing ${remote}:`, err);
    }
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json({ synced: totalSynced });
}
