import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

const SYNC_INTERVAL_MS = 15_000;
const KEEPALIVE_INTERVAL_MS = 30_000;
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch unread counts per folder for the given email account.
 */
async function getUnreadCounts(accountId: string) {
  const rows = await prisma.emailMessage.groupBy({
    by: ["folder"],
    where: { accountId, isRead: false },
    _count: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.folder] = row._count.id;
  }
  return counts;
}

/**
 * GET /api/email/stream
 *
 * Server-Sent Events endpoint for real-time email notifications.
 * On connect it triggers an immediate sync, then polls every 15 seconds
 * and pushes `new_emails` and `counts` events to the client.
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
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

      const sendPing = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      };

      // Detect client disconnect via AbortSignal
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      /**
       * Trigger the existing sync endpoint via internal fetch and return
       * the number of newly synced emails.
       */
      const doSync = async (): Promise<number> => {
        try {
          // Build an absolute URL for the sync endpoint.
          // In server-side contexts, request.url gives us the origin.
          const origin = new URL(request.url).origin;
          const res = await fetch(`${origin}/api/email/sync`, {
            method: "POST",
            headers: {
              // Forward cookies so the sync endpoint can authenticate.
              cookie: request.headers.get("cookie") ?? "",
            },
          });
          if (!res.ok) return 0;
          const json = (await res.json()) as { synced?: number };
          return json.synced ?? 0;
        } catch (err) {
          console.error("[email-stream] sync fetch failed:", err);
          return 0;
        }
      };

      // Keepalive timer
      const keepaliveTimer = setInterval(sendPing, KEEPALIVE_INTERVAL_MS);

      const started = Date.now();

      const run = async () => {
        // Track previous counts to detect changes
        let prevCounts: Record<string, number> = {};

        while (!closed && Date.now() - started < MAX_DURATION_MS) {
          try {
            const synced = await doSync();

            // Always send counts so the client stays up to date
            const counts = await getUnreadCounts(account.id);

            if (synced > 0) {
              send("new_emails", { count: synced });
            }

            // Send counts if they changed (or on first iteration)
            const countsChanged =
              JSON.stringify(counts) !== JSON.stringify(prevCounts);
            if (countsChanged) {
              send("counts", counts);
              prevCounts = counts;
            }
          } catch (err) {
            console.error("[email-stream] poll error:", err);
          }

          // Wait for the next sync interval, but break early if closed
          await new Promise<void>((resolve) => {
            if (closed) return resolve();
            const timer = setTimeout(resolve, SYNC_INTERVAL_MS);
            request.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }

        // Cleanup
        clearInterval(keepaliveTimer);
        if (!closed) {
          send("timeout", { message: "SSE connection timed out" });
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };

      run();
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
