import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import type { EmailAccount } from "@prisma/client";
import { decrypt } from "./crypto";

export function getSmtpTransport(account: EmailAccount) {
  const password = decrypt(account.encryptedPass);
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.username, pass: password },
  });
}

export function getImapClient(account: EmailAccount) {
  const password = decrypt(account.encryptedPass);
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: { user: account.username, pass: password },
    logger: false,
  });
}

export async function testSmtpConnection(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.verify();
    transport.close();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function testImapConnection(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface FetchedEmail {
  messageId: string | undefined;
  inReplyTo: string | undefined;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string | undefined;
  bodyText: string | undefined;
  date: Date | undefined;
  uid: number;
}

const IMAP_FOLDER_MAP: Record<string, string> = {
  INBOX: "INBOX",
  SENT: "Sent",
  DRAFTS: "Drafts",
  SPAM: "Spam",
  TRASH: "Trash",
};

const IMAP_FOLDER_ALIASES: Record<string, string[]> = {
  SENT: ["Sent", "Sent Messages", "Sent Items", "[Gmail]/Sent Mail", "INBOX.Sent"],
  DRAFTS: ["Drafts", "[Gmail]/Drafts", "INBOX.Drafts"],
  SPAM: ["Spam", "Junk", "Junk E-mail", "[Gmail]/Spam", "INBOX.Spam"],
  TRASH: ["Trash", "Deleted", "Deleted Messages", "[Gmail]/Trash", "INBOX.Trash"],
};

/**
 * Resolve the actual IMAP mailbox name for a logical folder.
 * Tries the primary name first, then aliases, falling back to the primary.
 */
async function resolveMailbox(
  client: ImapFlow,
  folder: string,
): Promise<string | null> {
  if (folder === "INBOX") return "INBOX";

  const aliases = IMAP_FOLDER_ALIASES[folder] ?? [IMAP_FOLDER_MAP[folder] ?? folder];
  const allNames = [IMAP_FOLDER_MAP[folder], ...aliases].filter(Boolean) as string[];
  const unique = [...new Set(allNames)];

  const list = await client.list();
  const available = new Set(list.map((m) => m.path));

  for (const name of unique) {
    if (available.has(name)) return name;
  }
  return null;
}

function addressToStrings(
  addr: ParsedMail["from"],
): string[] {
  if (!addr) return [];
  if ("value" in addr) {
    return addr.value.map((a) => a.address ?? "").filter(Boolean);
  }
  return [];
}

export async function fetchEmailsFromImap(
  account: EmailAccount,
  folder: string,
  since?: Date,
): Promise<FetchedEmail[]> {
  const client = getImapClient(account);
  const results: FetchedEmail[] = [];

  try {
    await client.connect();

    const mailbox = await resolveMailbox(client, folder);
    if (!mailbox) return results;

    const lock = await client.getMailboxLock(mailbox);
    try {
      const searchCriteria: Record<string, unknown> = {};
      if (since) searchCriteria.since = since;

      const messages = client.fetch(
        since ? { since } : "1:*",
        { envelope: true, source: true, uid: true },
      );

      for await (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source);
          results.push({
            messageId: parsed.messageId ?? undefined,
            inReplyTo: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined,
            from: addressToStrings(parsed.from)[0] ?? "",
            to: addressToStrings(parsed.to as ParsedMail["from"]),
            cc: addressToStrings(parsed.cc as ParsedMail["from"]),
            subject: parsed.subject ?? "(no subject)",
            bodyHtml: parsed.html || undefined,
            bodyText: parsed.text ?? undefined,
            date: parsed.date ?? undefined,
            uid: msg.uid,
          });
        } catch {
          // skip unparseable messages
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error(`[email] IMAP fetch error for ${folder}:`, err);
    try { await client.logout(); } catch {}
  }

  return results;
}
