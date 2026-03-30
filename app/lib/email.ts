import tls from "node:tls";
import type { EmailAccount } from "@prisma/client";
import { ImapFlow } from "imapflow";
import { type ParsedMail, simpleParser } from "mailparser";
import nodemailer from "nodemailer";
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testPop3Connection(
  host: string,
  port: number,
  user: string,
  pass: string,
): Promise<{ ok: boolean; error?: string }> {
  let client: Pop3Client | null = null;
  try {
    client = await Pop3Client.connect(host, port);
    await client.login(user, pass);
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (client) {
      await client.quit();
    }
  }
}

class Pop3Client {
  private socket: tls.TLSSocket;
  private buffer = Buffer.alloc(0);
  private failure: Error | null = null;
  private waiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  private constructor(socket: tls.TLSSocket) {
    this.socket = socket;
    this.socket.setTimeout(15000);
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.flushWaiters();
    });
    this.socket.on("timeout", () => {
      this.fail(new Error("POP3 socket timeout"));
    });
    this.socket.on("error", (err) => {
      this.fail(err instanceof Error ? err : new Error(String(err)));
    });
    this.socket.on("close", () => {
      this.fail(new Error("POP3 socket closed"));
    });
  }

  static async connect(host: string, port: number): Promise<Pop3Client> {
    const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const sock = tls.connect({
        host,
        port,
        servername: host,
      });
      const onError = (err: unknown) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      sock.once("secureConnect", () => {
        sock.off("error", onError);
        resolve(sock);
      });
      sock.once("error", onError);
    });

    const client = new Pop3Client(socket);
    const greeting = await client.readLine();
    if (!greeting.startsWith("+OK")) {
      throw new Error(`POP3 greeting failed: ${greeting}`);
    }
    return client;
  }

  private flushWaiters() {
    if (this.waiters.length === 0) return;
    const pending = [...this.waiters];
    this.waiters = [];
    for (const waiter of pending) waiter.resolve();
  }

  private fail(err: Error) {
    if (this.failure) return;
    this.failure = err;
    const pending = [...this.waiters];
    this.waiters = [];
    for (const waiter of pending) waiter.reject(err);
  }

  private async waitForData() {
    if (this.failure) throw this.failure;
    if (this.buffer.length > 0) return;
    await new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    if (this.failure) throw this.failure;
  }

  private async readLine(): Promise<string> {
    while (true) {
      const idx = this.buffer.indexOf("\r\n");
      if (idx !== -1) {
        const line = this.buffer.subarray(0, idx).toString("utf8");
        this.buffer = this.buffer.subarray(idx + 2);
        return line;
      }
      await this.waitForData();
    }
  }

  private async readMultiline(): Promise<string> {
    const terminators = [
      Buffer.from("\r\n.\r\n"),
      Buffer.from("\n.\r\n"),
      Buffer.from("\r\n.\n"),
      Buffer.from("\n.\n"),
      Buffer.from(".\r\n"),
    ];
    while (true) {
      let matchIndex = -1;
      let matchLength = 0;
      for (const term of terminators) {
        const idx = this.buffer.indexOf(term);
        if (idx !== -1 && (matchIndex === -1 || idx < matchIndex)) {
          matchIndex = idx;
          matchLength = term.length;
        }
      }

      if (matchIndex !== -1) {
        const block = this.buffer.subarray(0, matchIndex).toString("utf8");
        this.buffer = this.buffer.subarray(matchIndex + matchLength);
        return block
          .split(/\r?\n/)
          .map((line) => (line.startsWith("..") ? line.slice(1) : line))
          .join("\r\n");
      }

      await this.waitForData();
    }
  }

  private async sendCommand(command: string): Promise<string> {
    this.socket.write(`${command}\r\n`);
    const line = await this.readLine();
    if (!line.startsWith("+OK")) {
      throw new Error(`POP3 ${command} failed: ${line}`);
    }
    return line;
  }

  async login(username: string, password: string): Promise<void> {
    await this.sendCommand(`USER ${username}`);
    await this.sendCommand(`PASS ${password}`);
  }

  async listMessageNumbers(): Promise<number[]> {
    await this.sendCommand("UIDL");
    const block = await this.readMultiline();
    return block
      .split("\r\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => Number.parseInt(line.split(/\s+/)[0] ?? "", 10))
      .filter((num) => Number.isFinite(num));
  }

  async retrieveMessage(messageNumber: number): Promise<string> {
    await this.sendCommand(`RETR ${messageNumber}`);
    return this.readMultiline();
  }

  async topMessage(messageNumber: number, lines = 50): Promise<string> {
    await this.sendCommand(`TOP ${messageNumber} ${lines}`);
    return this.readMultiline();
  }

  async quit(): Promise<void> {
    try {
      await this.sendCommand("QUIT");
    } catch {
      // ignore QUIT failures during cleanup
    } finally {
      this.socket.destroy();
    }
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

type EnvelopeAddress =
  | {
      address?: string | null;
      mailbox?: string | null;
      host?: string | null;
    }
  | null
  | undefined;

export async function fetchEmailsFromPop3(
  account: EmailAccount,
  since?: Date,
): Promise<FetchedEmail[]> {
  const password = decrypt(account.encryptedPass);
  const results: FetchedEmail[] = [];
  let client: Pop3Client | null = null;

  try {
    client = await Pop3Client.connect(account.imapHost, account.imapPort);
    await client.login(account.username, password);

    const allMessageNumbers = await client.listMessageNumbers();
    const latestNumbers = allMessageNumbers.slice(-20).reverse();

    for (const messageNumber of latestNumbers) {
      try {
        let source = "";
        try {
          source = await client.topMessage(messageNumber, 80);
        } catch {
          source = await client.retrieveMessage(messageNumber);
        }
        const parsed = await simpleParser(Buffer.from(source, "utf8"));
        if (since && parsed.date && parsed.date < since) continue;
        results.push({
          messageId: parsed.messageId ?? undefined,
          inReplyTo:
            typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined,
          from: addressToStrings(parsed.from)[0] ?? "",
          to: addressToStrings(parsed.to as ParsedMail["from"]),
          cc: addressToStrings(parsed.cc as ParsedMail["from"]),
          subject: parsed.subject ?? "(no subject)",
          bodyHtml: parsed.html || undefined,
          bodyText: parsed.text ?? undefined,
          date: parsed.date ?? undefined,
          uid: messageNumber,
        });
      } catch {
        // skip messages that fail to download/parse
      }
    }
  } catch (err) {
    console.error("[email] POP3 fetch error:", err);
  } finally {
    if (client) {
      await client.quit();
    }
  }

  return results;
}

const IMAP_FOLDER_MAP: Record<string, string> = {
  INBOX: "INBOX",
  SENT: "Sent",
  DRAFTS: "Drafts",
  SPAM: "Spam",
  TRASH: "Trash",
};

const IMAP_FOLDER_ALIASES: Record<string, string[]> = {
  SENT: [
    "Sent",
    "Sent Messages",
    "Sent Items",
    "[Gmail]/Sent Mail",
    "INBOX.Sent",
  ],
  DRAFTS: ["Drafts", "[Gmail]/Drafts", "INBOX.Drafts"],
  SPAM: ["Spam", "Junk", "Junk E-mail", "[Gmail]/Spam", "INBOX.Spam"],
  TRASH: [
    "Trash",
    "Deleted",
    "Deleted Messages",
    "[Gmail]/Trash",
    "INBOX.Trash",
  ],
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

  const aliases = IMAP_FOLDER_ALIASES[folder] ?? [
    IMAP_FOLDER_MAP[folder] ?? folder,
  ];
  const allNames = [IMAP_FOLDER_MAP[folder], ...aliases].filter(
    Boolean,
  ) as string[];
  const unique = [...new Set(allNames)];

  const list = await client.list();
  const available = new Set(list.map((m) => m.path));

  for (const name of unique) {
    if (available.has(name)) return name;
  }
  return null;
}

function addressToStrings(addr: ParsedMail["from"]): string[] {
  if (!addr) return [];
  if ("value" in addr) {
    return addr.value.map((a) => a.address ?? "").filter(Boolean);
  }
  return [];
}

function envelopeAddressesToStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  for (const raw of input) {
    const item = raw as EnvelopeAddress;
    if (!item) continue;
    if (typeof item.address === "string" && item.address) {
      out.push(item.address);
      continue;
    }

    const mailbox = typeof item.mailbox === "string" ? item.mailbox : "";
    const host = typeof item.host === "string" ? item.host : "";
    const combined = mailbox && host ? `${mailbox}@${host}` : "";
    if (combined) out.push(combined);
  }
  return out;
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
      // Fetch latest messages with full source for body content.
      const allUids = await client.search(since ? { since } : { all: true });
      const targetUids = allUids.slice(-20);
      if (targetUids.length === 0) return results;

      const messages = client.fetch(targetUids, {
        envelope: true,
        source: true,
        uid: true,
      });

      for await (const msg of messages) {
        try {
          const envelope = msg.envelope as {
            messageId?: string | null;
            inReplyTo?: string | null;
            from?: unknown;
            to?: unknown;
            cc?: unknown;
            subject?: string | null;
            date?: Date | null;
          } | null;
          const fromList = envelopeAddressesToStrings(envelope?.from);
          const inReplyToValue = envelope?.inReplyTo;

          let bodyHtml: string | undefined;
          let bodyText: string | undefined;

          // Parse full message source for body content
          if (msg.source) {
            try {
              const parsed = await simpleParser(msg.source);
              bodyHtml = parsed.html || undefined;
              bodyText = parsed.text || undefined;
            } catch {
              // Ignore parse errors, body will remain undefined
            }
          }

          results.push({
            messageId: envelope?.messageId ?? undefined,
            inReplyTo:
              typeof inReplyToValue === "string" ? inReplyToValue : undefined,
            from: fromList[0] ?? "",
            to: envelopeAddressesToStrings(envelope?.to),
            cc: envelopeAddressesToStrings(envelope?.cc),
            subject: envelope?.subject ?? "(no subject)",
            bodyHtml,
            bodyText,
            date: envelope?.date ?? undefined,
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
    try {
      await client.logout();
    } catch {}
  }

  return results;
}

/**
 * Fetch emails from MULTIPLE folders using a SINGLE IMAP connection.
 * Avoids "Too many simultaneous connections" from Gmail.
 */
export async function fetchAllFoldersImap(
  account: EmailAccount,
  folders: string[],
  since?: Date,
): Promise<Map<string, FetchedEmail[]>> {
  const client = getImapClient(account);
  const resultMap = new Map<string, FetchedEmail[]>();
  for (const f of folders) resultMap.set(f, []);

  try {
    await client.connect();

    for (const folder of folders) {
      try {
        const mailbox = await resolveMailbox(client, folder);
        if (!mailbox) continue;

        const lock = await client.getMailboxLock(mailbox);
        try {
          const allUids = await client.search(since ? { since } : { all: true });
          const targetUids = allUids.slice(-20);
          if (targetUids.length === 0) continue;

          const messages = client.fetch(targetUids, {
            envelope: true,
            source: true,
            uid: true,
          });

          const folderEmails: FetchedEmail[] = [];
          for await (const msg of messages) {
            try {
              const envelope = msg.envelope as {
                messageId?: string | null;
                inReplyTo?: string | null;
                from?: unknown;
                to?: unknown;
                cc?: unknown;
                subject?: string | null;
                date?: Date | null;
              } | null;
              const fromList = envelopeAddressesToStrings(envelope?.from);
              const inReplyToValue = envelope?.inReplyTo;

              let bodyHtml: string | undefined;
              let bodyText: string | undefined;
              if (msg.source) {
                try {
                  const parsed = await simpleParser(msg.source);
                  bodyHtml = parsed.html || undefined;
                  bodyText = parsed.text || undefined;
                } catch {}
              }

              folderEmails.push({
                messageId: envelope?.messageId ?? undefined,
                inReplyTo: typeof inReplyToValue === "string" ? inReplyToValue : undefined,
                from: fromList[0] ?? "",
                to: envelopeAddressesToStrings(envelope?.to),
                cc: envelopeAddressesToStrings(envelope?.cc),
                subject: envelope?.subject ?? "(no subject)",
                bodyHtml,
                bodyText,
                date: envelope?.date ?? undefined,
                uid: msg.uid,
              });
            } catch {}
          }
          resultMap.set(folder, folderEmails);
        } finally {
          lock.release();
        }
      } catch (err) {
        console.error(`[email] IMAP folder ${folder} error:`, err);
      }
    }

    await client.logout();
  } catch (err) {
    console.error("[email] IMAP connection error:", err);
    try { await client.logout(); } catch {}
  }

  return resultMap;
}
