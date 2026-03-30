import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";
import { onNewEmail, startIdleWatcher } from "@/app/lib/imap-idle";

export const dynamic = "force-dynamic";

const KEEPALIVE_INTERVAL_MS = 25_000;
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/email/stream
 *
 * SSE endpoint powered by IMAP IDLE — gets notified INSTANTLY
 * when new email arrives. No polling, no repeated sync calls.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return new Response(
      JSON.stringify({ error: "No email account configured" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Start the IDLE watcher (singleton — only one connection per account)
  await startIdleWatcher(account);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // When IDLE detects new email, notify this SSE client
      const unsubscribe = onNewEmail(() => {
        send("new_email", { timestamp: Date.now() });
      });

      // Keepalive
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      }, KEEPALIVE_INTERVAL_MS);

      // Auto-close after max duration
      const maxTimer = setTimeout(() => {
        if (!closed) {
          send("timeout", { message: "Reconnect" });
          cleanup();
        }
      }, MAX_DURATION_MS);

      // Client disconnect
      request.signal.addEventListener("abort", () => cleanup());

      function cleanup() {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(keepalive);
        clearTimeout(maxTimer);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
