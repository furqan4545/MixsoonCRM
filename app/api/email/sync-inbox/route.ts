import type { EmailFolder } from "@prisma/client";
import { NextResponse } from "next/server";
import { type FetchedEmail, fetchEmailsFromImap } from "@/app/lib/email";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

/**
 * POST /api/email/sync-inbox — Fast sync for INBOX only.
 * Called when IMAP IDLE detects a new email. Only fetches the latest
 * 5 messages from INBOX, skips all other folders.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ synced: 0 });
  }

  // Only look back 1 day for quick sync
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let emails: FetchedEmail[];
  try {
    emails = await fetchEmailsFromImap(account, "INBOX", since);
  } catch (err) {
    console.error("[sync-inbox] IMAP fetch error:", err);
    return NextResponse.json({ synced: 0 });
  }

  if (emails.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  // Deduplicate against existing
  const messageIds = emails
    .map((e) => e.messageId)
    .filter((id): id is string => !!id);

  const existing = messageIds.length > 0
    ? await prisma.emailMessage.findMany({
        where: { accountId: account.id, messageId: { in: messageIds } },
        select: { messageId: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.messageId));

  const newEmails = emails.filter(
    (e) => e.messageId && !existingSet.has(e.messageId),
  );

  if (newEmails.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  // Auto-match influencer by from and to
  const allAddrs = new Set<string>();
  for (const e of newEmails) {
    if (e.from) allAddrs.add(e.from.toLowerCase());
    if (e.to) for (const addr of e.to) allAddrs.add(addr.toLowerCase());
  }
  const influencers = await prisma.influencer.findMany({
    where: { email: { in: [...allAddrs], mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const emailToInf = new Map<string, string>();
  for (const inf of influencers) {
    if (inf.email) emailToInf.set(inf.email.toLowerCase(), inf.id);
  }

  // Thread inheritance
  const inReplyToValues = newEmails
    .map((e) => e.inReplyTo)
    .filter((v): v is string => !!v);
  const parentMap = new Map<string, { threadId: string | null; influencerId: string | null }>();
  if (inReplyToValues.length > 0) {
    const parents = await prisma.emailMessage.findMany({
      where: { accountId: account.id, messageId: { in: inReplyToValues } },
      select: { messageId: true, threadId: true, influencerId: true },
    });
    for (const p of parents) {
      if (p.messageId) parentMap.set(p.messageId, p);
    }
  }

  const toInsert = newEmails.map((e) => {
    let influencerId = emailToInf.get(e.from.toLowerCase());
    if (!influencerId && e.to) {
      for (const addr of e.to) {
        const match = emailToInf.get(addr.toLowerCase());
        if (match) { influencerId = match; break; }
      }
    }
    // Inherit from parent thread
    const parent = e.inReplyTo ? parentMap.get(e.inReplyTo) : undefined;
    if (!influencerId && parent?.influencerId) {
      influencerId = parent.influencerId;
    }
    const threadId = (e.inReplyTo && parent?.threadId)
      ? parent.threadId
      : e.messageId ?? undefined;

    return {
      accountId: account.id,
      messageId: e.messageId ?? undefined,
      inReplyTo: e.inReplyTo ?? undefined,
      from: e.from,
      to: e.to,
      cc: e.cc ?? [],
      subject: e.subject,
      bodyHtml: e.bodyHtml ?? undefined,
      bodyText: e.bodyText ?? undefined,
      folder: "INBOX" as EmailFolder,
      isRead: false,
      receivedAt: e.date ?? new Date(),
      threadId,
      influencerId: influencerId ?? undefined,
    };
  });

  await prisma.emailMessage.createMany({ data: toInsert });

  // Update last sync
  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });

  return NextResponse.json({ synced: toInsert.length });
}
