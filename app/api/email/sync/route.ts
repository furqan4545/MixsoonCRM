import type { EmailFolder } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  type FetchedEmail,
  fetchEmailsFromImap,
  fetchEmailsFromPop3,
} from "@/app/lib/email";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

const SYNC_FOLDERS: { remote: string; local: EmailFolder }[] = [
  { remote: "INBOX", local: "INBOX" },
];

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

async function emailExists(
  accountId: string,
  folder: EmailFolder,
  email: FetchedEmail,
): Promise<boolean> {
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

function toCreateData(
  accountId: string,
  folder: EmailFolder,
  email: FetchedEmail,
): {
  accountId: string;
  messageId?: string;
  inReplyTo?: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  folder: EmailFolder;
  isRead: boolean;
  receivedAt: Date;
  threadId?: string;
} {
  return {
    accountId,
    messageId: email.messageId ?? undefined,
    inReplyTo: email.inReplyTo ?? undefined,
    from: email.from,
    to: email.to,
    cc: email.cc,
    subject: email.subject,
    bodyHtml: email.bodyHtml ?? undefined,
    bodyText: email.bodyText ?? undefined,
    folder,
    isRead: folder !== "INBOX",
    receivedAt: email.date ?? new Date(),
    threadId: email.inReplyTo ?? email.messageId ?? undefined,
  };
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    // Avoid noisy 404s from sidebar auto-sync before account is connected.
    return NextResponse.json({
      synced: 0,
      skipped: true,
      reason: "NO_ACCOUNT",
    });
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const since =
    account.lastSyncAt && account.lastSyncAt > threeDaysAgo
      ? account.lastSyncAt
      : threeDaysAgo;
  let totalSynced = 0;

  const isHiworksPop3 =
    account.smtpHost.includes("hiworks.com") ||
    account.imapHost.includes("pop3s.hiworks.com");
  if (isHiworksPop3) {
    try {
      const emails = await fetchEmailsFromPop3(account);
      const messageIds = emails
        .map((email) => email.messageId)
        .filter((id): id is string => !!id);
      const existingIdSet = new Set<string>();

      if (messageIds.length > 0) {
        const existingByMessageId = await prisma.emailMessage.findMany({
          where: {
            accountId: account.id,
            messageId: { in: [...new Set(messageIds)] },
          },
          select: { messageId: true },
        });
        for (const row of existingByMessageId) {
          if (row.messageId) existingIdSet.add(row.messageId);
        }
      }

      const toInsert: ReturnType<typeof toCreateData>[] = [];
      for (const email of emails) {
        if (email.messageId && existingIdSet.has(email.messageId)) continue;
        if (
          !email.messageId &&
          (await emailExists(account.id, "INBOX", email))
        ) {
          continue;
        }

        toInsert.push(toCreateData(account.id, "INBOX", email));
        if (email.messageId) existingIdSet.add(email.messageId);
      }

      if (toInsert.length > 0) {
        await prisma.emailMessage.createMany({ data: toInsert });
        totalSynced += toInsert.length;
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
      const messageIds = emails
        .map((email) => email.messageId)
        .filter((id): id is string => !!id);
      const existingIdSet = new Set<string>();

      if (messageIds.length > 0) {
        const existingByMessageId = await prisma.emailMessage.findMany({
          where: {
            accountId: account.id,
            messageId: { in: [...new Set(messageIds)] },
          },
          select: { messageId: true },
        });
        for (const row of existingByMessageId) {
          if (row.messageId) existingIdSet.add(row.messageId);
        }
      }

      const toInsert: ReturnType<typeof toCreateData>[] = [];
      for (const email of emails) {
        if (email.messageId && existingIdSet.has(email.messageId)) continue;
        if (!email.messageId && (await emailExists(account.id, local, email))) {
          continue;
        }

        toInsert.push(toCreateData(account.id, local, email));
        if (email.messageId) existingIdSet.add(email.messageId);
      }

      if (toInsert.length > 0) {
        await prisma.emailMessage.createMany({ data: toInsert });
        totalSynced += toInsert.length;
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
