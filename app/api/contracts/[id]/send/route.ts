import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSmtpTransport } from "@/app/lib/email";

/**
 * POST /api/contracts/[id]/send
 * Generate a signing link and email it to the influencer.
 * Updates contract status to SENT.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    // Fetch contract with influencer
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        influencer: {
          select: { id: true, username: true, displayName: true, email: true },
        },
        template: { select: { name: true } },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 },
      );
    }

    if (!contract.influencer.email) {
      return NextResponse.json(
        { error: "Influencer has no email address. Add an email first." },
        { status: 400 },
      );
    }

    // Get the first email account for sending
    const emailAccount = await prisma.emailAccount.findFirst();

    if (!emailAccount) {
      return NextResponse.json(
        { error: "No email account configured. Set up email in Settings first." },
        { status: 400 },
      );
    }

    // Generate signing token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.onboardingToken.create({
      data: {
        token,
        influencerId: contract.influencerId,
        type: "CONTRACT",
        contractId: contract.id,
        expiresAt,
      },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const signingUrl = `${baseUrl}/portal/contract/${token}`;

    // Build email
    const influencerName =
      contract.influencer.displayName || contract.influencer.username;
    const templateName = contract.template?.name || "Collaboration Agreement";

    const subject = `[MIXSOON] Contract for Signature — ${templateName}`;
    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">MIXSOON</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px;">Hi ${influencerName},</p>
          <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.6;">
            We've prepared a <strong>${templateName}</strong> for your review and signature.
            Please click the button below to review the contract details and sign it electronically.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signingUrl}"
               style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
              Review &amp; Sign Contract
            </a>
          </div>
          <p style="font-size: 12px; color: #999; margin: 24px 0 0; line-height: 1.5;">
            This link expires in 30 days. If you have any questions, reply to this email.
          </p>
        </div>
      </div>
    `;

    // Send email
    const transport = getSmtpTransport(emailAccount);
    const info = await transport.sendMail({
      from: emailAccount.displayName
        ? `"${emailAccount.displayName}" <${emailAccount.emailAddress}>`
        : emailAccount.emailAddress,
      to: contract.influencer.email,
      subject,
      html: bodyHtml,
    });
    transport.close();

    // Store email in DB
    await prisma.emailMessage.create({
      data: {
        id: crypto.randomUUID(),
        accountId: emailAccount.id,
        messageId: info.messageId || undefined,
        from: emailAccount.emailAddress,
        to: [contract.influencer.email],
        cc: [],
        subject,
        bodyHtml,
        bodyText: `Hi ${influencerName}, please review and sign your contract: ${signingUrl}`,
        folder: "SENT",
        isRead: true,
        sentAt: new Date(),
        influencerId: contract.influencerId,
      },
    });

    // Update contract status to SENT
    await prisma.contract.update({
      where: { id },
      data: { status: "SENT" },
    });

    // Activity log
    await prisma.activityLog.create({
      data: {
        influencerId: contract.influencerId,
        type: "contract",
        title: "Contract sent for signature",
        detail: `"${templateName}" emailed to ${contract.influencer.email}`,
      },
    });

    return NextResponse.json({
      success: true,
      signingUrl,
      emailSentTo: contract.influencer.email,
    });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/send]", error);
    return NextResponse.json(
      { error: "Failed to send contract" },
      { status: 500 },
    );
  }
}
