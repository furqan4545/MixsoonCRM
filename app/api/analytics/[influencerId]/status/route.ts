import { type NextRequest } from "next/server";
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
      const started = Date.now();

      const poll = async () => {
        while (Date.now() - started < MAX_DURATION) {
          try {
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
              send({ status: "NO_RUN", progress: 0, message: "No analysis run found" });
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

        send({ status: "TIMEOUT", progress: 0, message: "SSE connection timed out" });
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
