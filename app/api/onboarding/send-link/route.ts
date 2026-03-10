import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSmtpTransport } from "@/app/lib/email";

/**
 * POST /api/onboarding/send-link
 * Generate an onboarding magic link and email it to the influencer.
 */
export async function POST(request: Request) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { influencerId } = body;

    if (!influencerId) {
      return NextResponse.json(
        { error: "influencerId is required" },
        { status: 400 },
      );
    }

    // Fetch influencer
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
      select: { id: true, username: true, displayName: true, email: true },
    });

    if (!influencer) {
      return NextResponse.json(
        { error: "Influencer not found" },
        { status: 404 },
      );
    }

    if (!influencer.email) {
      return NextResponse.json(
        { error: "Influencer has no email address. Add an email first." },
        { status: 400 },
      );
    }

    // Get email account
    const emailAccount = await prisma.emailAccount.findFirst({
      where: { isActive: true },
    });

    if (!emailAccount) {
      return NextResponse.json(
        { error: "No email account configured. Set up email in Settings first." },
        { status: 400 },
      );
    }

    // Generate onboarding token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.onboardingToken.create({
      data: {
        token,
        influencerId,
        type: "ONBOARDING",
        expiresAt,
      },
    });

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const onboardingUrl = `${baseUrl}/portal/onboard/${token}`;

    // Build email
    const influencerName = influencer.displayName || influencer.username;

    const subject = "[MIXSOON] Complete Your Onboarding";
    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a1a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">MIXSOON</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="font-size: 16px; color: #333; margin: 0 0 16px;">Hi ${influencerName},</p>
          <p style="font-size: 14px; color: #555; margin: 0 0 8px; line-height: 1.6;">
            We're excited to work with you! To get started, please complete your onboarding by providing:
          </p>
          <ul style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.8; padding-left: 20px;">
            <li>Bank account details for payments</li>
            <li>Shipping address for product delivery</li>
          </ul>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${onboardingUrl}"
               style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
              Complete Onboarding
            </a>
          </div>
          <p style="font-size: 12px; color: #999; margin: 24px 0 0; line-height: 1.5;">
            This link expires in 30 days. No account creation needed — just click and fill out the form.
            If you have any questions, reply to this email.
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
      to: influencer.email,
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
        to: [influencer.email],
        cc: [],
        subject,
        bodyHtml,
        bodyText: `Hi ${influencerName}, please complete your onboarding: ${onboardingUrl}`,
        folder: "SENT",
        isRead: true,
        date: new Date(),
        influencerId,
      },
    });

    // Activity log
    await prisma.activityLog.create({
      data: {
        influencerId,
        type: "onboarding",
        title: "Onboarding link emailed",
        detail: `Sent to ${influencer.email}`,
      },
    });

    return NextResponse.json({
      success: true,
      onboardingUrl,
      emailSentTo: influencer.email,
    });
  } catch (error) {
    console.error("[POST /api/onboarding/send-link]", error);
    return NextResponse.json(
      { error: "Failed to send onboarding link" },
      { status: 500 },
    );
  }
}
