import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";
import { getSmtpTransport } from "@/app/lib/email";

// POST /api/portal/submit-content — Public (token-based): submit video links + optional payment
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, videoLinks, notes, bankDetails, sCode, submissionLabel } = body;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // 1. Validate token
    const tokenRecord = await prisma.onboardingToken.findUnique({
      where: { token },
      include: {
        influencer: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    if (tokenRecord.usedAt) {
      return NextResponse.json(
        { error: "This link has already been used" },
        { status: 410 },
      );
    }
    if (tokenRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This link has expired" },
        { status: 410 },
      );
    }

    const isContentType = tokenRecord.type === "CONTENT";
    const isPaymentType = tokenRecord.type === "PAYMENT";

    if (!isContentType && !isPaymentType) {
      return NextResponse.json(
        { error: "Invalid token type" },
        { status: 400 },
      );
    }

    // 2. Validate video links for CONTENT type
    if (isContentType) {
      if (!videoLinks || !Array.isArray(videoLinks) || videoLinks.length === 0) {
        return NextResponse.json(
          { error: "At least one video link is required" },
          { status: 400 },
        );
      }
      // Validate each link is a non-empty string
      for (const link of videoLinks) {
        if (typeof link !== "string" || !link.trim()) {
          return NextResponse.json(
            { error: "All video links must be valid URLs" },
            { status: 400 },
          );
        }
      }
    }

    // 3. Validate bank details if payment is included
    const shouldIncludePayment = isPaymentType || tokenRecord.includePayment;
    if (shouldIncludePayment && bankDetails) {
      const { bankName, accountNumber, accountHolder } = bankDetails;
      if (!bankName || !accountNumber || !accountHolder) {
        return NextResponse.json(
          { error: "Bank name, account number, and account holder are required" },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const influencerName =
      tokenRecord.influencer.displayName || tokenRecord.influencer.username;

    // 4. Prepare bank details if provided
    if (shouldIncludePayment && bankDetails) {
      // Also upsert InfluencerOnboarding for centralized payment data
      await prisma.influencerOnboarding.upsert({
        where: { influencerId: tokenRecord.influencerId },
        create: {
          influencerId: tokenRecord.influencerId,
          bankName: bankDetails.bankName,
          accountNumber: encrypt(bankDetails.accountNumber),
          accountHolder: bankDetails.accountHolder,
          bankCode: bankDetails.bankCode || null,
          fullName: bankDetails.accountHolder,
          addressLine1: "",
          city: "",
          postalCode: "",
          country: "South Korea",
        },
        update: {
          bankName: bankDetails.bankName,
          accountNumber: encrypt(bankDetails.accountNumber),
          accountHolder: bankDetails.accountHolder,
          bankCode: bankDetails.bankCode || null,
          submittedAt: now,
        },
      });
    }

    // 5. Create or update ContentSubmission
    const cleanVideoLinks = isContentType
      ? (videoLinks as string[]).map((l: string) => l.trim())
      : [];

    let submission;
    if (tokenRecord.contentSubmissionId) {
      submission = await prisma.contentSubmission.update({
        where: { id: tokenRecord.contentSubmissionId },
        data: {
          videoLinks: cleanVideoLinks,
          notes: notes || null,
          sCode: sCode?.trim() || null,
          submissionLabel: submissionLabel?.trim() || tokenRecord.submissionLabel || null,
          includePayment: shouldIncludePayment,
          status: "SUBMITTED",
          submittedAt: now,
          ...(shouldIncludePayment && bankDetails
            ? {
                bankName: bankDetails.bankName,
                accountNumber: encrypt(bankDetails.accountNumber),
                accountHolder: bankDetails.accountHolder,
                bankCode: bankDetails.bankCode || null,
              }
            : {}),
        },
      });
    } else {
      submission = await prisma.contentSubmission.create({
        data: {
          influencerId: tokenRecord.influencerId,
          videoLinks: cleanVideoLinks,
          notes: notes || null,
          sCode: sCode?.trim() || null,
          submissionLabel: submissionLabel?.trim() || tokenRecord.submissionLabel || null,
          includePayment: shouldIncludePayment,
          status: "SUBMITTED",
          submittedAt: now,
          ...(shouldIncludePayment && bankDetails
            ? {
                bankName: bankDetails.bankName,
                accountNumber: encrypt(bankDetails.accountNumber),
                accountHolder: bankDetails.accountHolder,
                bankCode: bankDetails.bankCode || null,
              }
            : {}),
        },
      });

      // Link to token
      await prisma.onboardingToken.update({
        where: { id: tokenRecord.id },
        data: { contentSubmissionId: submission.id },
      });
    }

    // 5. Mark token as used
    await prisma.onboardingToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: now },
    });

    // 6. Log activity
    const activityTitle = isContentType
      ? "Content submitted"
      : "Payment details submitted";
    const activityDetail = isContentType
      ? `${influencerName} submitted ${videoLinks.length} video link${videoLinks.length !== 1 ? "s" : ""}${shouldIncludePayment && bankDetails ? " and payment details" : ""}`
      : `${influencerName} submitted payment details`;

    await prisma.activityLog.create({
      data: {
        influencerId: tokenRecord.influencerId,
        type: "content_submission",
        title: activityTitle,
        detail: activityDetail,
      },
    });

    // 7. Bell notification for admins
    await prisma.notification.create({
      data: {
        type: "content_submitted",
        status: "info",
        title: activityTitle,
        message: activityDetail,
      },
    });

    // 8. Email alert
    try {
      const emailAccount = await prisma.emailAccount.findFirst();
      if (emailAccount) {
        const baseUrl =
          process.env.NEXTAUTH_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";
        const dashboardUrl = `${baseUrl}/influencers?selected=${tokenRecord.influencerId}&tab=documents`;

        const alertHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #2563eb; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">MIXSOON — ${activityTitle}</h1>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 16px;">
                <strong>${influencerName}</strong> has submitted ${isContentType ? `${videoLinks.length} video link${videoLinks.length !== 1 ? "s" : ""}` : "payment details"}.
              </p>
              ${isContentType ? `<p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.6;">Please review and verify the submitted content in the dashboard.</p>` : ""}
              <div style="text-align: center; margin: 32px 0;">
                <a href="${dashboardUrl}"
                   style="display: inline-block; background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
                  View in Dashboard
                </a>
              </div>
              <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
                Submitted on ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
        `;

        const transport = getSmtpTransport(emailAccount);
        await transport.sendMail({
          from: emailAccount.displayName
            ? `"${emailAccount.displayName}" <${emailAccount.emailAddress}>`
            : emailAccount.emailAddress,
          to: emailAccount.emailAddress,
          subject: `[MIXSOON] ${activityTitle} — ${influencerName}`,
          html: alertHtml,
        });
        transport.close();
      }
    } catch (emailErr) {
      console.error("[POST /api/portal/submit-content] Email notification failed:", emailErr);
    }

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("[POST /api/portal/submit-content]", error);
    return NextResponse.json(
      { error: "Failed to process submission" },
      { status: 500 },
    );
  }
}
