import { prisma } from "@/app/lib/prisma";
import { getSmtpTransport } from "@/app/lib/email";

/**
 * Send a "the influencer submitted X" email back to the user who originally
 * sent the form. Falls back gracefully when the sender or their email
 * account can't be resolved — we still email *someone* so submissions are
 * never silent, but we never crash a submission if SMTP fails.
 */
export async function notifySubmissionReceived(params: {
  /** ID of the user who sent the form. May be null for legacy tokens. */
  createdById: string | null;
  /** Display name of the influencer who just submitted. */
  influencerName: string;
  /** Influencer ID — used to deep-link the dashboard CTA. */
  influencerId: string;
  /** Heading shown in the email — e.g. "Content submitted". */
  title: string;
  /** Body sentence — e.g. "@user submitted 2 videos and payment details". */
  detail: string;
  /** Optional secondary line shown above the CTA. */
  hint?: string;
  /** Tab to open in the influencer panel (defaults to documents). */
  dashboardTab?: string;
}): Promise<void> {
  const recipient = await resolveRecipient(params.createdById);
  if (!recipient) {
    console.warn(
      `[submission-notify] No recipient resolvable for createdById=${params.createdById}; submission "${params.title}" will not trigger an email`,
    );
    return;
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";
  const tab = params.dashboardTab ?? "documents";
  const dashboardUrl = `${baseUrl}/influencers?selected=${params.influencerId}&tab=${tab}`;
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const greeting = recipient.toName ? `Hi ${recipient.toName},` : "Hi,";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #2563eb; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">MIXSOON — ${escapeHtml(params.title)}</h1>
      </div>
      <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="font-size: 14px; color: #555; margin: 0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="font-size: 16px; color: #333; margin: 0 0 16px; line-height: 1.5;">
          ${escapeHtml(params.detail)}
        </p>
        ${
          params.hint
            ? `<p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.6;">${escapeHtml(params.hint)}</p>`
            : ""
        }
        <div style="text-align: center; margin: 32px 0;">
          <a href="${dashboardUrl}"
             style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
            View in Dashboard
          </a>
        </div>
        <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
          Submitted on ${today}. You're receiving this because you sent the form to ${escapeHtml(params.influencerName)}.
        </p>
      </div>
    </div>
  `;

  try {
    const transport = getSmtpTransport(recipient.account);
    await transport.sendMail({
      from: recipient.account.displayName
        ? `"${recipient.account.displayName}" <${recipient.account.emailAddress}>`
        : recipient.account.emailAddress,
      to: recipient.toAddress,
      subject: `[MIXSOON] ${params.title} — ${params.influencerName}`,
      html,
    });
    transport.close();
  } catch (err) {
    console.error("[submission-notify] sendMail failed:", err);
  }
}

type Recipient = {
  account: Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>;
  toAddress: string;
  toName: string | null;
};

async function resolveRecipient(
  createdById: string | null,
): Promise<(Omit<Recipient, "account"> & { account: NonNullable<Recipient["account"]> }) | null> {
  // Path 1: token has a recorded sender → email goes to them, sent from their account
  if (createdById) {
    const sender = await prisma.user.findUnique({
      where: { id: createdById },
      select: { id: true, name: true, email: true, emailAccount: true },
    });
    if (sender?.emailAccount) {
      return {
        account: sender.emailAccount,
        toAddress: sender.emailAccount.emailAddress,
        toName: sender.name ?? sender.emailAccount.displayName ?? null,
      };
    }
    // Sender exists but no SMTP account → still notify them via someone
    // else's outbox so they at least see it on their auth email.
    if (sender) {
      const fallback = await prisma.emailAccount.findFirst();
      if (fallback) {
        return {
          account: fallback,
          toAddress: sender.email,
          toName: sender.name ?? null,
        };
      }
    }
  }

  // Path 2: no sender (legacy tokens) → fall back to the first configured
  // outbox so the message isn't lost. Same address for from/to.
  const fallback = await prisma.emailAccount.findFirst();
  if (fallback) {
    return {
      account: fallback,
      toAddress: fallback.emailAddress,
      toName: fallback.displayName ?? null,
    };
  }

  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
