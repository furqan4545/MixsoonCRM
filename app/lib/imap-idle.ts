// IMAP IDLE watcher — keeps a persistent connection to Gmail and
// gets notified INSTANTLY when new emails arrive. No polling needed.
import type { EmailAccount } from "@prisma/client";
import { getImapClient } from "./email";

type Listener = () => void;

let idleClient: ReturnType<typeof getImapClient> | null = null;
let idleAccountId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
const listeners: Set<Listener> = new Set();

/** Register a callback for when new email arrives */
export function onNewEmail(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

async function connect(account: EmailAccount) {
  if (isConnecting) return;
  isConnecting = true;

  try {
    // Clean up old client
    if (idleClient) {
      try { await idleClient.logout(); } catch {}
      idleClient = null;
    }

    const client = getImapClient(account);
    idleClient = client;
    idleAccountId = account.id;

    // Listen for new messages
    client.on("exists", (data: { count: number; prevCount: number }) => {
      if (data.count > data.prevCount) {
        console.log(`[imap-idle] New email detected (${data.prevCount} → ${data.count})`);
        notifyListeners();
      }
    });

    // Handle connection close — reconnect
    client.on("close", () => {
      console.log("[imap-idle] Connection closed, reconnecting in 5s...");
      idleClient = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(account), 5000);
    });

    client.on("error", (err: Error) => {
      console.error("[imap-idle] Error:", err.message);
    });

    await client.connect();
    console.log("[imap-idle] Connected to", account.imapHost);

    // Open INBOX and let auto-IDLE kick in
    await client.getMailboxLock("INBOX");
    // Don't release the lock — we want to stay in IDLE on INBOX
    console.log("[imap-idle] IDLE watching INBOX");
  } catch (err) {
    console.error("[imap-idle] Connect failed:", err);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(account), 10000);
  } finally {
    isConnecting = false;
  }
}

/** Start the IDLE watcher for an email account */
export async function startIdleWatcher(account: EmailAccount) {
  if (idleAccountId === account.id && idleClient) {
    return; // Already watching this account
  }
  await connect(account);
}

/** Stop the IDLE watcher */
export async function stopIdleWatcher() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (idleClient) {
    try { await idleClient.logout(); } catch {}
    idleClient = null;
    idleAccountId = null;
  }
}

/** Check if IDLE is running */
export function isIdleActive(): boolean {
  return idleClient !== null && idleAccountId !== null;
}
