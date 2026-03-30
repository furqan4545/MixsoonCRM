import crypto from "node:crypto";
import { getSmtpTransport } from "./email";
import { prisma } from "./prisma";

/**
 * Scans the DB for overdue items and creates AlertEvent records.
 * Also processes per-email follow-up alerts (EmailAlert).
 * Designed to be called from an API route (POST /api/alerts/check).
 */
export async function checkAlerts(): Promise<{
  created: number;
  emailAlerts: { resolved: number; triggered: number; sent: number };
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

  // Process per-email follow-up alerts
  let emailAlerts = { resolved: 0, triggered: 0, sent: 0 };
  try {
    emailAlerts = await processEmailAlerts();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`EMAIL_ALERTS: ${msg}`);
    console.error("[alert-checker] processEmailAlerts failed:", err);
  }

  return { created, emailAlerts, errors };
}

// ── PROCESS PER-EMAIL ALERTS ─────────────────────────────
/**
 * Process all WAITING EmailAlerts:
 * 1. Auto-resolve if influencer has replied
 * 2. If overdue + template → auto-send follow-up email
 * 3. If overdue + no template → just mark TRIGGERED
 */
export async function processEmailAlerts(): Promise<{
  resolved: number;
  triggered: number;
  sent: number;
}> {
  const now = new Date();
  let resolved = 0;
  let triggered = 0;
  let sent = 0;

  // Fetch all WAITING alerts
  const waitingAlerts = await prisma.emailAlert.findMany({
    where: { status: "WAITING" },
    include: {
      emailMessage: {
        select: {
          id: true,
          accountId: true,
          from: true,
          to: true,
          subject: true,
          sentAt: true,
          folder: true,
          influencerId: true,
          threadId: true,
          messageId: true,
        },
      },
      template: true,
    },
  });

  for (const alert of waitingAlerts) {
    const email = alert.emailMessage;
    if (!email.sentAt) continue;

    // Check if influencer replied (INBOX message from influencer after we sent)
    const hasReply = await checkInfluencerReplied(email);

    if (hasReply) {
      // Auto-resolve — influencer replied
      await prisma.emailAlert.update({
        where: { id: alert.id },
        data: { status: "RESOLVED", resolvedAt: now },
      });
      resolved++;
      continue;
    }

    // Check if overdue (triggerAt has passed)
    if (alert.triggerAt > now) continue; // Not yet due

    // Overdue — try to send follow-up if template exists
    if (alert.template) {
      try {
        const followUpEmailId = await sendFollowUpEmail(
          email,
          alert.template.subject,
          alert.template.bodyHtml,
        );
        await prisma.emailAlert.update({
          where: { id: alert.id },
          data: {
            status: "TRIGGERED",
            triggeredAt: now,
            followUpEmailId,
          },
        });
        sent++;
        triggered++;
      } catch (err) {
        console.error(
          `[alert-checker] Failed to send follow-up for alert ${alert.id}:`,
          err,
        );
        // Mark as triggered even if send failed (to avoid retrying forever)
        await prisma.emailAlert.update({
          where: { id: alert.id },
          data: { status: "TRIGGERED", triggeredAt: now },
        });
        triggered++;
      }
    } else {
      // No template — just mark triggered (notification only)
      await prisma.emailAlert.update({
        where: { id: alert.id },
        data: { status: "TRIGGERED", triggeredAt: now },
      });
      triggered++;
    }
  }

  return { resolved, triggered, sent };
}

/**
 * Check if the influencer replied after we sent the email.
 * Looks for INBOX messages from the same thread or same influencer.
 */
async function checkInfluencerReplied(email: {
  accountId: string;
  sentAt: Date | null;
  influencerId: string | null;
  threadId: string | null;
  to: string[];
}): Promise<boolean> {
  if (!email.sentAt) return false;

  // Method 1: Check by threadId — any INBOX message in the same thread after sentAt
  if (email.threadId) {
    const threadReply = await prisma.emailMessage.findFirst({
      where: {
        accountId: email.accountId,
        threadId: email.threadId,
        folder: "INBOX",
        receivedAt: { gt: email.sentAt },
      },
      select: { id: true },
    });
    if (threadReply) return true;
  }

  // Method 2: Check by influencerId — any INBOX message from this influencer after sentAt
  if (email.influencerId) {
    const influencerReply = await prisma.emailMessage.findFirst({
      where: {
        accountId: email.accountId,
        influencerId: email.influencerId,
        folder: "INBOX",
        receivedAt: { gt: email.sentAt },
      },
      select: { id: true },
    });
    if (influencerReply) return true;
  }

  // Method 3: Check by recipient email — any INBOX from that email address
  if (email.to.length > 0) {
    const fromReply = await prisma.emailMessage.findFirst({
      where: {
        accountId: email.accountId,
        from: { in: email.to },
        folder: "INBOX",
        receivedAt: { gt: email.sentAt },
      },
      select: { id: true },
    });
    if (fromReply) return true;
  }

  return false;
}

/**
 * Send a follow-up email using the alert template.
 * Returns the new EmailMessage id.
 */
async function sendFollowUpEmail(
  originalEmail: {
    id: string;
    accountId: string;
    to: string[];
    subject: string;
    influencerId: string | null;
    threadId: string | null;
    messageId: string | null;
  },
  templateSubject: string,
  templateBodyHtml: string,
): Promise<string> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: originalEmail.accountId },
  });
  if (!account) throw new Error("Email account not found");

  const transport = getSmtpTransport(account);
  const emailId = crypto.randomUUID();

  // Use template subject or fall back to "Re: <original subject>"
  const subject = templateSubject || `Re: ${originalEmail.subject}`;

  try {
    const info = await transport.sendMail({
      from: account.displayName
        ? `"${account.displayName}" <${account.emailAddress}>`
        : account.emailAddress,
      to: originalEmail.to.join(", "),
      subject,
      html: templateBodyHtml,
      inReplyTo: originalEmail.messageId || undefined,
    });

    // Normalize threadId
    let threadIdValue =
      originalEmail.threadId ||
      originalEmail.messageId ||
      info.messageId ||
      undefined;

    const followUpEmail = await prisma.emailMessage.create({
      data: {
        id: emailId,
        accountId: account.id,
        messageId: info.messageId || undefined,
        inReplyTo: originalEmail.messageId || undefined,
        from: account.emailAddress,
        to: originalEmail.to,
        cc: [],
        subject,
        bodyHtml: templateBodyHtml,
        folder: "SENT",
        isRead: true,
        sentAt: new Date(),
        influencerId: originalEmail.influencerId || undefined,
        threadId: threadIdValue,
      },
    });

    transport.close();
    return followUpEmail.id;
  } catch (err) {
    transport.close();
    throw err;
  }
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
      account: { select: { emailAddress: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true } },
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

      // Auto-send reminder email to ourselves
      if (inbox.account?.emailAddress && inbox.account?.smtpHost) {
        try {
          const transport = getSmtpTransport({
            host: inbox.account.smtpHost,
            port: inbox.account.smtpPort ?? 587,
            user: inbox.account.smtpUser ?? inbox.account.emailAddress,
            pass: inbox.account.smtpPass ?? "",
          });
          await transport.sendMail({
            from: inbox.account.emailAddress,
            to: inbox.account.emailAddress,
            subject: `[REMINDER] Reply to ${name} — ${inbox.subject}`,
            html: `<p>You haven't replied to <strong>${name}</strong> for <strong>${daysSince} days</strong>.</p>
<p><strong>Subject:</strong> ${inbox.subject}</p>
<p><strong>From:</strong> ${inbox.from}</p>
<p style="color:#666;font-size:12px;">This is an automated reminder from MIXSOON.</p>`,
          });
          transport.close();
        } catch (emailErr) {
          console.error(`[alert-checker] Failed to send self-reminder for ${name}:`, emailErr);
        }
      }
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
