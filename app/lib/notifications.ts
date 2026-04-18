import { prisma } from "./prisma";

export type NotificationType =
  | "import_save"
  | "ai_filter"
  | "approval"
  | "payment_due"
  | "payment_submitted";
export type NotificationStatus = "success" | "error" | "info";

export async function createNotification(params: {
  type: NotificationType;
  status?: NotificationStatus;
  title: string;
  message?: string | null;
  importId?: string | null;
  runId?: string | null;
  approvalId?: string | null;
  paymentId?: string | null;
  userId?: string | null;
}): Promise<{ id: string } | null> {
  try {
    if (!prisma?.notification) {
      console.error(
        "[notifications] Prisma client missing notification delegate",
      );
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
        approvalId: params.approvalId ?? null,
        paymentId: params.paymentId ?? null,
        userId: params.userId ?? null,
      },
    });
  } catch (err) {
    console.error("[notifications] createNotification failed:", err);
    return null;
  }
}

/**
 * Fan-out a notification to every ACTIVE user whose role grants the given permission.
 * Returns number of notifications created.
 */
export async function notifyUsersWithPermission(params: {
  feature: string;
  action: string;
  type: NotificationType;
  title: string;
  message?: string | null;
  status?: NotificationStatus;
  paymentId?: string | null;
  approvalId?: string | null;
  runId?: string | null;
  importId?: string | null;
}): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: {
        permissions: { some: { feature: params.feature, action: params.action } },
      },
    },
    select: { id: true },
  });

  if (users.length === 0) return 0;

  await prisma.notification.createMany({
    data: users.map((u) => ({
      type: params.type,
      status: params.status ?? "info",
      title: params.title,
      message: params.message ?? null,
      paymentId: params.paymentId ?? null,
      approvalId: params.approvalId ?? null,
      runId: params.runId ?? null,
      importId: params.importId ?? null,
      userId: u.id,
    })),
  });

  return users.length;
}

/**
 * Shortcut for finance / payments team alerts.
 */
export function notifyPaymentsTeam(params: {
  type: "payment_due" | "payment_submitted";
  title: string;
  message?: string | null;
  status?: NotificationStatus;
  paymentId?: string | null;
}): Promise<number> {
  return notifyUsersWithPermission({
    feature: "payments",
    action: "write",
    ...params,
  });
}
