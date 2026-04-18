/**
 * Dry-run inspection for the payment-due alerts + finance-scoping work.
 *
 *   npx tsx scripts/test-payment-alerts.ts
 *
 * Prints:
 *   1. Who will receive finance-scoped notifications (users with payments.write).
 *   2. Which payments would trigger an overdue alert right now (same query the cron runs).
 *   3. How many notifications currently exist (by scope).
 *
 * Read-only — no writes.
 */
import { prisma } from "../app/lib/prisma";

const PENDING_DAYS = Number(process.env.PENDING_DAYS ?? 7);
const PROCESSING_DAYS = Number(process.env.PROCESSING_DAYS ?? 3);

async function main() {
  console.log("\n═══ 1. Finance-team users (payments.write) ═══");
  const financeUsers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { permissions: { some: { feature: "payments", action: "write" } } },
    },
    select: { id: true, email: true, name: true, role: { select: { name: true } } },
  });
  if (financeUsers.length === 0) {
    console.log("  ⚠ No active users have payments.write — fan-out would no-op.");
  } else {
    for (const u of financeUsers) {
      console.log(`  · ${u.name ?? "(no name)"} <${u.email}> — role: ${u.role.name}`);
    }
  }

  console.log(`\n═══ 2. Overdue payments (PENDING > ${PENDING_DAYS}d, PROCESSING > ${PROCESSING_DAYS}d) ═══`);
  const now = Date.now();
  const pendingCutoff = new Date(now - PENDING_DAYS * 86400_000);
  const processingCutoff = new Date(now - PROCESSING_DAYS * 86400_000);

  const overdue = await prisma.payment.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: pendingCutoff } },
        { status: "PROCESSING", createdAt: { lt: processingCutoff } },
      ],
    },
    include: { influencer: { select: { username: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (overdue.length === 0) {
    console.log("  (none)");
  } else {
    for (const p of overdue) {
      const days = Math.floor((now - p.createdAt.getTime()) / 86400_000);
      const label = p.influencer.displayName || p.influencer.username;
      console.log(
        `  · ${p.status.padEnd(10)} ${days}d overdue — ${label} (@${p.influencer.username}) — ${p.amount.toLocaleString()} ${p.currency}`,
      );
    }
    console.log(`\n  → Running the cron would fan out ${overdue.length} alert${overdue.length === 1 ? "" : "s"} × ${financeUsers.length} user${financeUsers.length === 1 ? "" : "s"} = ${overdue.length * financeUsers.length} notification rows.`);
  }

  console.log("\n═══ 3. Current Notification rows by scope ═══");
  const total = await prisma.notification.count();
  const broadcast = await prisma.notification.count({ where: { userId: null } });
  const scoped = await prisma.notification.count({ where: { NOT: { userId: null } } });
  const paymentDue = await prisma.notification.count({ where: { type: "payment_due" } });
  const paymentSubmitted = await prisma.notification.count({ where: { type: "payment_submitted" } });
  console.log(`  total:              ${total}`);
  console.log(`  broadcast (null):   ${broadcast}`);
  console.log(`  user-scoped:        ${scoped}`);
  console.log(`  type=payment_due:   ${paymentDue}`);
  console.log(`  type=payment_submitted: ${paymentSubmitted}`);

  if (process.argv.includes("--fire")) {
    console.log("\n═══ 4. LIVE FAN-OUT TEST (creates + deletes test rows) ═══");
    const { notifyPaymentsTeam } = await import("../app/lib/notifications");
    const testTitle = `__TEST__ payment-due fan-out ${Date.now()}`;
    const created = await notifyPaymentsTeam({
      type: "payment_due",
      status: "info",
      title: testTitle,
      message: "This is a dry-run test notification. Will be deleted.",
    });
    console.log(`  created ${created} notification row(s)`);
    const rows = await prisma.notification.findMany({
      where: { title: testTitle },
      select: { id: true, userId: true },
    });
    for (const r of rows) {
      const u = r.userId
        ? await prisma.user.findUnique({
            where: { id: r.userId },
            select: { email: true },
          })
        : null;
      console.log(`    → userId=${r.userId ?? "(null/broadcast)"} ${u ? `(${u.email})` : ""}`);
    }
    const { count } = await prisma.notification.deleteMany({
      where: { title: testTitle },
    });
    console.log(`  cleaned up ${count} test row(s)`);
  } else {
    console.log("\n(tip: re-run with --fire to exercise the fan-out helper live and clean up)");
  }

  console.log("\nDone.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
