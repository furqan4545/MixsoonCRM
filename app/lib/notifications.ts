import { prisma } from "./prisma";

export type NotificationType = "import_save" | "ai_filter";
export type NotificationStatus = "success" | "error" | "info";

export async function createNotification(params: {
  type: NotificationType;
  status?: NotificationStatus;
  title: string;
  message?: string | null;
  importId?: string | null;
  runId?: string | null;
}): Promise<{ id: string } | null> {
  try {
    if (!prisma?.notification) {
      console.error("[notifications] Prisma client missing notification delegate");
      return null;
    }
    return await prisma.notification.create({
      data: {
        type: params.type,
        status: params.status ?? "info",
        title: params.title,
        message: params.message ?? null,
        importId: params.importId ?? null,
        runId: params.runId ?? null,
      },
    });
  } catch (err) {
    console.error("[notifications] createNotification failed:", err);
    return null;
  }
}
