import type { NextRequest } from "next/server";
import { reapStaleRuns } from "@/app/lib/analysis-run-reaper";
import { prisma } from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ influencerId: string }> },
) {
  const { influencerId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const POLL_INTERVAL = 1500; // 1.5s
      const MAX_DURATION = 10 * 60 * 1000; // 10 minutes
      const REAP_EVERY = 10_000; // 10s — don't run reaper on every poll
      const started = Date.now();
      let lastReapAt = 0;

      const poll = async () => {
        while (Date.now() - started < MAX_DURATION) {
          try {
            // Periodically reap stale runs so the client sees FAILED instead
            // of an "in progress" status that will never advance.
            if (Date.now() - lastReapAt >= REAP_EVERY) {
              lastReapAt = Date.now();
              await reapStaleRuns({ influencerId });
            }

            const run = await prisma.analysisRun.findFirst({
              where: { influencerId },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                status: true,
                mode: true,
                progress: true,
                progressMsg: true,
                commentCount: true,
                avatarCount: true,
                analyzedCount: true,
                errorMessage: true,
              },
            });

            if (!run) {
              send({
                status: "NO_RUN",
                progress: 0,
                message: "No analysis run found",
              });
              controller.close();
              return;
            }

            send({
              runId: run.id,
              status: run.status,
              mode: run.mode,
              progress: run.progress,
              message: run.progressMsg ?? "",
              commentCount: run.commentCount,
              avatarCount: run.avatarCount,
              analyzedCount: run.analyzedCount,
              errorMessage: run.errorMessage,
            });

            if (run.status === "COMPLETED" || run.status === "FAILED") {
              controller.close();
              return;
            }
          } catch (err) {
            send({
              status: "ERROR",
              progress: 0,
              message: `Status check failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            });
          }

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
        }

        // Reap once on timeout — if the run died, surface FAILED on next reconnect.
        await reapStaleRuns({ influencerId }).catch(() => {});
        send({
          status: "TIMEOUT",
          progress: 0,
          message: "Status stream timed out — reconnect to see current state",
        });
        controller.close();
      };

      poll();
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
