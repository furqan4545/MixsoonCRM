import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSmtpTransport } from "@/app/lib/email";

// POST /api/payments/request-details — send payment form link to influencer
export async function POST(request: NextRequest) {
  const currentUser = await requirePermission("payments", "write");

  const body = await request.json();
  const { influencerId } = body;

  if (!influencerId) {
    return NextResponse.json({ error: "influencerId required" }, { status: 400 });
  }

  const influencer = await prisma.influencer.findUnique({
    where: { id: influencerId },
    select: { id: true, username: true, displayName: true, email: true },
  });

  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  if (!influencer.email) {
    return NextResponse.json({ error: "Influencer has no email address" }, { status: 400 });
  }

  // Generate payment token
  const tokenValue = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  // Create content submission for this token
  const submission = await prisma.contentSubmission.create({
    data: { influencerId, includePayment: true },
  });

  await prisma.onboardingToken.create({
    data: {
      token: tokenValue,
      influencerId,
      type: "PAYMENT",
      includePayment: true,
      contentSubmissionId: submission.id,
      expiresAt,
    },
  });

  const portalUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/portal/submit/${tokenValue}`;

  // Get sender's email account
  const senderAccount = await prisma.emailAccount.findUnique({
    where: { userId: currentUser.id },
  });

  if (!senderAccount) {
    return NextResponse.json(
      { error: "Connect your email in Settings first", link: portalUrl },
      { status: 400 },
    );
  }

  // Send email to influencer
  const transport = getSmtpTransport(senderAccount);
  try {
    await transport.sendMail({
      from: `"MIXSOON" <${senderAccount.emailAddress}>`,
      to: influencer.email,
      subject: "Please submit your payment details",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px 0;">Payment Details Request</h2>
          <p>Hi ${influencer.displayName || influencer.username},</p>
          <p>Please provide your bank account details so we can process your payment. Click the button below to submit your information securely.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${portalUrl}" style="display: inline-block; background: #333; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Submit Payment Details →
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">This link expires in 30 days.</p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">— MIXSOON Team</p>
        </div>
      `,
    });
    transport.close();
  } catch (err) {
    transport.close();
    return NextResponse.json(
      { error: `Failed to send email: ${err instanceof Error ? err.message : String(err)}`, link: portalUrl },
      { status: 500 },
    );
  }

  await prisma.activityLog.create({
    data: {
      influencerId,
      type: "payment_details_requested",
      title: "Payment details requested",
      detail: `Form link emailed to ${influencer.email}`,
    },
  });

  return NextResponse.json({ success: true, link: portalUrl });
}
