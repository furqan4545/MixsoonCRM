import { prisma } from "./prisma";

/**
 * Scans the DB for overdue items and creates AlertEvent records.
 * Designed to be called from an API route (POST /api/alerts/check).
 * Skips duplicates via unique constraints on [ruleId, approvalId] and [ruleId, emailId].
 */
export async function checkAlerts(): Promise<{
  created: number;
  errors: string[];
}> {
  let created = 0;
  const errors: string[] = [];

  const rules = await prisma.alertRule.findMany({
    where: { enabled: true },
  });

  for (const rule of rules) {
    try {
      switch (rule.type) {
        case "APPROVAL_PENDING":
          created += await checkApprovalPending(rule.id, rule.thresholdDays);
          break;
        case "EMAIL_NO_REPLY_INFLUENCER":
          created += await checkEmailNoReplyInfluencer(
            rule.id,
            rule.thresholdDays,
          );
          break;
        case "EMAIL_NO_REPLY_US":
          created += await checkEmailNoReplyUs(rule.id, rule.thresholdDays);
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${rule.type}: ${msg}`);
      console.error(`[alert-checker] ${rule.type} failed:`, err);
    }
  }

  return { created, errors };
}

// ── APPROVAL_PENDING ──────────────────────────────────────
async function checkApprovalPending(
  ruleId: string,
  thresholdDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const overdue = await prisma.approvalRequest.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    include: {
      influencer: { select: { username: true, displayName: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });

  let count = 0;
  for (const a of overdue) {
    const daysSince = Math.floor(
      (Date.now() - a.createdAt.getTime()) / 86_400_000,
    );
    const name = a.influencer.displayName || `@${a.influencer.username}`;
    try {
      await prisma.alertEvent.create({
        data: {
          ruleId,
          approvalId: a.id,
          influencerId: a.influencerId,
          title: `Approval pending for ${name}`,
          message: `Submitted by ${a.submittedBy.name || a.submittedBy.email} ${daysSince} days ago. Rate: ${a.currency} ${a.rate}`,
          daysSince,
        },
      });
      count++;
    } catch (err: unknown) {
      // Skip duplicate (unique constraint violation)
      if (isPrismaUniqueError(err)) continue;
      throw err;
    }
  }
  return count;
}

// ── EMAIL_NO_REPLY_INFLUENCER ─────────────────────────────
// We sent an email, influencer hasn't replied in X days
async function checkEmailNoReplyInfluencer(
  ruleId: string,
  thresholdDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  // Find latest SENT email per influencer where there's no subsequent INBOX reply
  const sentEmails = await prisma.emailMessage.findMany({
    where: {
      folder: "SENT",
      influencerId: { not: null },
      sentAt: { lt: cutoff },
    },
    orderBy: { sentAt: "desc" },
    distinct: ["influencerId"],
    include: {
      influencer: { select: { username: true, displayName: true, email: true } },
    },
  });

  let count = 0;
  for (const sent of sentEmails) {
    if (!sent.influencerId || !sent.sentAt) continue;

    // Check if there's any INBOX message from this influencer after our sent date
    const reply = await prisma.emailMessage.findFirst({
      where: {
        influencerId: sent.influencerId,
        folder: "INBOX",
        receivedAt: { gt: sent.sentAt },
      },
    });

    if (reply) continue; // Influencer replied, no alert needed

    const daysSince = Math.floor(
      (Date.now() - sent.sentAt.getTime()) / 86_400_000,
    );
    const name =
      sent.influencer?.displayName || `@${sent.influencer?.username}`;

    try {
      await prisma.alertEvent.create({
        data: {
          ruleId,
          emailId: sent.id,
          influencerId: sent.influencerId,
          title: `No reply from ${name}`,
          message: `Last email sent ${daysSince} days ago. Subject: "${sent.subject}"`,
          daysSince,
        },
      });
      count++;
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) continue;
      throw err;
    }
  }
  return count;
}

// ── EMAIL_NO_REPLY_US ──────────────────────────────────────
// Influencer sent us an email, we haven't replied in X days
async function checkEmailNoReplyUs(
  ruleId: string,
  thresholdDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const inboxEmails = await prisma.emailMessage.findMany({
    where: {
      folder: "INBOX",
      influencerId: { not: null },
      receivedAt: { lt: cutoff },
    },
    orderBy: { receivedAt: "desc" },
    distinct: ["influencerId"],
    include: {
      influencer: { select: { username: true, displayName: true, email: true } },
    },
  });

  let count = 0;
  for (const inbox of inboxEmails) {
    if (!inbox.influencerId || !inbox.receivedAt) continue;

    // Check if we sent any email to this influencer after the inbox date
    const ourReply = await prisma.emailMessage.findFirst({
      where: {
        influencerId: inbox.influencerId,
        folder: "SENT",
        sentAt: { gt: inbox.receivedAt },
      },
    });

    if (ourReply) continue; // We already replied

    const daysSince = Math.floor(
      (Date.now() - inbox.receivedAt.getTime()) / 86_400_000,
    );
    const name =
      inbox.influencer?.displayName || `@${inbox.influencer?.username}`;

    try {
      await prisma.alertEvent.create({
        data: {
          ruleId,
          emailId: inbox.id,
          influencerId: inbox.influencerId,
          title: `We haven't replied to ${name}`,
          message: `Received ${daysSince} days ago. Subject: "${inbox.subject}"`,
          daysSince,
        },
      });
      count++;
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) continue;
      throw err;
    }
  }
  return count;
}

// ── helpers ───────────────────────────────────────────────
function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}
