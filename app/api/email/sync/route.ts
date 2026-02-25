import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import {
  fetchEmailsFromImap,
  fetchEmailsFromPop3,
  type FetchedEmail,
} from "@/app/lib/email";
import type { EmailFolder } from "@prisma/client";

const SYNC_FOLDERS: { remote: string; local: EmailFolder }[] = [
  { remote: "INBOX", local: "INBOX" },
  { remote: "SENT", local: "SENT" },
  { remote: "DRAFTS", local: "DRAFTS" },
  { remote: "SPAM", local: "SPAM" },
  { remote: "TRASH", local: "TRASH" },
];

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

async function emailExists(
  accountId: string,
  folder: EmailFolder,
  email: FetchedEmail,
): Promise<boolean> {
  if (email.messageId) {
    const existingByMessageId = await prisma.emailMessage.findFirst({
      where: { accountId, messageId: email.messageId },
      select: { id: true },
    });
    if (existingByMessageId) return true;
  }

  if (!email.date) return false;

  const existingByFingerprint = await prisma.emailMessage.findFirst({
    where: {
      accountId,
      folder,
      messageId: null,
      from: email.from,
      subject: email.subject,
      receivedAt: {
        gte: new Date(email.date.getTime() - DEDUPE_WINDOW_MS),
        lte: new Date(email.date.getTime() + DEDUPE_WINDOW_MS),
      },
    },
    select: { id: true },
  });
  return !!existingByFingerprint;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "No email account connected" }, { status: 404 });
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const since = account.lastSyncAt && account.lastSyncAt > threeDaysAgo
    ? account.lastSyncAt
    : threeDaysAgo;
  let totalSynced = 0;

  const isHiworksPop3 =
    account.smtpHost.includes("hiworks.com") ||
    account.imapHost.includes("pop3s.hiworks.com");
  if (isHiworksPop3) {
    try {
      const emails = await fetchEmailsFromPop3(account);
      for (const email of emails) {
        if (await emailExists(account.id, "INBOX", email)) continue;

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
            folder: "INBOX",
            isRead: false,
            receivedAt: email.date ?? new Date(),
            threadId: email.inReplyTo ?? email.messageId ?? undefined,
          },
        });
        totalSynced++;
      }
    } catch (err) {
      console.error("[email-sync] Error syncing POP3 inbox:", err);
    }

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({ synced: totalSynced, protocol: "POP3" });
  }

  for (const { remote, local } of SYNC_FOLDERS) {
    try {
      const emails = await fetchEmailsFromImap(account, remote, since);

      for (const email of emails) {
        if (await emailExists(account.id, local, email)) continue;

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
