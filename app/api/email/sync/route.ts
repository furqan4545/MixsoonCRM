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
  { remote: "SENT", local: "SENT" },
  { remote: "DRAFTS", local: "DRAFTS" },
  { remote: "SPAM", local: "SPAM" },
  { remote: "TRASH", local: "TRASH" },
];

const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const POP3_FETCH_TIMEOUT_MS = 12000;
const IMAP_FETCH_TIMEOUT_MS = 15000;

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
  influencerId?: string;
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => {
          console.warn(`[email-sync] ${label} timed out after ${timeoutMs}ms`);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
      const emails = await withTimeout(
        fetchEmailsFromPop3(account),
        POP3_FETCH_TIMEOUT_MS,
        [],
        "POP3 fetch",
      );
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
        // --- Auto-match influencer by sender email (POP3) ---
        const senderEmails = [
          ...new Set(toInsert.map((item) => item.from.toLowerCase()).filter(Boolean)),
        ];
        if (senderEmails.length > 0) {
          const matchedInfluencers = await prisma.influencer.findMany({
            where: { email: { in: senderEmails, mode: "insensitive" } },
            select: { id: true, email: true },
          });
          const emailToInfluencer = new Map<string, string>();
          for (const inf of matchedInfluencers) {
            if (inf.email) emailToInfluencer.set(inf.email.toLowerCase(), inf.id);
          }
          for (const item of toInsert) {
            const influencerId = emailToInfluencer.get(item.from.toLowerCase());
            if (influencerId) item.influencerId = influencerId;
          }
        }

        // --- Normalize threadId to root (POP3) ---
        const inReplyToValues = [
          ...new Set(
            toInsert.map((item) => item.inReplyTo).filter(Boolean) as string[],
          ),
        ];
        if (inReplyToValues.length > 0) {
          const parentEmails = await prisma.emailMessage.findMany({
            where: {
              accountId: account.id,
              messageId: { in: inReplyToValues },
            },
            select: { messageId: true, threadId: true },
          });
          const threadIdMap = new Map<string, string>();
          for (const parent of parentEmails) {
            if (parent.messageId && parent.threadId) {
              threadIdMap.set(parent.messageId, parent.threadId);
            }
          }
          for (const item of toInsert) {
            if (item.inReplyTo && threadIdMap.has(item.inReplyTo)) {
              item.threadId = threadIdMap.get(item.inReplyTo)!;
            }
          }
        }

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

  const folderResults = await Promise.all(
    SYNC_FOLDERS.map(async ({ remote, local }) => {
      try {
        const emails = await withTimeout(
          fetchEmailsFromImap(account, remote, since),
          IMAP_FETCH_TIMEOUT_MS,
          [],
          `IMAP ${remote}`,
        );
        return { local, emails };
      } catch (err) {
        console.error(`[email-sync] Error syncing ${remote}:`, err);
        return { local, emails: [] as FetchedEmail[] };
      }
    }),
  );

  const candidates: Array<{ folder: EmailFolder; email: FetchedEmail }> = [];
  for (const result of folderResults) {
    for (const email of result.emails) {
      candidates.push({ folder: result.local, email });
    }
  }

  const messageIds = candidates
    .map((item) => item.email.messageId)
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

  const seenInBatch = new Set<string>();
  const toInsert: ReturnType<typeof toCreateData>[] = [];
  const toBackfillBody: Array<{
    messageId: string;
    bodyHtml?: string;
    bodyText?: string;
  }> = [];

  for (const item of candidates) {
    const messageId = item.email.messageId;
    if (messageId) {
      if (seenInBatch.has(messageId)) continue;
      if (existingIdSet.has(messageId)) {
        // Email exists — queue body backfill if we have content
        if (item.email.bodyHtml || item.email.bodyText) {
          toBackfillBody.push({
            messageId,
            bodyHtml: item.email.bodyHtml,
            bodyText: item.email.bodyText,
          });
        }
        continue;
      }
      seenInBatch.add(messageId);
      toInsert.push(toCreateData(account.id, item.folder, item.email));
      continue;
    }

    if (await emailExists(account.id, item.folder, item.email)) continue;
    toInsert.push(toCreateData(account.id, item.folder, item.email));
  }

  if (toInsert.length > 0) {
    // --- Auto-match influencer by sender email ---
    const senderEmails = [
      ...new Set(toInsert.map((item) => item.from.toLowerCase()).filter(Boolean)),
    ];
    if (senderEmails.length > 0) {
      const matchedInfluencers = await prisma.influencer.findMany({
        where: { email: { in: senderEmails, mode: "insensitive" } },
        select: { id: true, email: true },
      });
      const emailToInfluencer = new Map<string, string>();
      for (const inf of matchedInfluencers) {
        if (inf.email) emailToInfluencer.set(inf.email.toLowerCase(), inf.id);
      }
      for (const item of toInsert) {
        const influencerId = emailToInfluencer.get(item.from.toLowerCase());
        if (influencerId) item.influencerId = influencerId;
      }
    }

    // --- Normalize threadId to root for proper threading ---
    const inReplyToValues = [
      ...new Set(
        toInsert.map((item) => item.inReplyTo).filter(Boolean) as string[],
      ),
    ];
    if (inReplyToValues.length > 0) {
      const parentEmails = await prisma.emailMessage.findMany({
        where: {
          accountId: account.id,
          messageId: { in: inReplyToValues },
        },
        select: { messageId: true, threadId: true },
      });
      const threadIdMap = new Map<string, string>();
      for (const parent of parentEmails) {
        if (parent.messageId && parent.threadId) {
          threadIdMap.set(parent.messageId, parent.threadId);
        }
      }
      for (const item of toInsert) {
        if (item.inReplyTo && threadIdMap.has(item.inReplyTo)) {
          item.threadId = threadIdMap.get(item.inReplyTo)!;
        }
      }
    }

    await prisma.emailMessage.createMany({ data: toInsert });
    totalSynced += toInsert.length;
  }

  // Backfill body content for existing emails that had no body (synced before body-fetch fix)
  if (toBackfillBody.length > 0) {
    for (const update of toBackfillBody) {
      try {
        await prisma.emailMessage.updateMany({
          where: {
            accountId: account.id,
            messageId: update.messageId,
            bodyHtml: null,
            bodyText: null,
          },
          data: {
            ...(update.bodyHtml ? { bodyHtml: update.bodyHtml } : {}),
            ...(update.bodyText ? { bodyText: update.bodyText } : {}),
          },
        });
      } catch {
        // Non-critical, skip individual backfill failures
      }
    }
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json({ synced: totalSynced });
}
