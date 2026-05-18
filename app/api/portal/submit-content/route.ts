import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";
import { notifyPaymentsTeam } from "@/app/lib/notifications";
import { notifySubmissionReceived } from "@/app/lib/submission-notify";

// POST /api/portal/submit-content — Public (token-based): submit video links + optional payment
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, videoLinks, videoFiles, notes, bankDetails, sCode, submissionLabel } = body;

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

    // 2. Validate video links / files for CONTENT type
    if (isContentType) {
      const linksArr = Array.isArray(videoLinks) ? videoLinks : [];
      const filesArr = Array.isArray(videoFiles) ? videoFiles : [];

      if (linksArr.length === 0 && filesArr.length === 0) {
        return NextResponse.json(
          { error: "At least one video link or uploaded file is required" },
          { status: 400 },
        );
      }
      for (const link of linksArr) {
        if (typeof link !== "string" || !link.trim()) {
          return NextResponse.json(
            { error: "All video links must be valid URLs" },
            { status: 400 },
          );
        }
      }
      for (const f of filesArr) {
        if (
          !f ||
          typeof f !== "object" ||
          typeof f.gcsPath !== "string" ||
          !f.gcsPath.startsWith("gcs://")
        ) {
          return NextResponse.json(
            { error: "Uploaded files are malformed" },
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
    // IBAN and routing number are sensitive — encrypt at rest with the same
    // helper as the account number. CC code and bank address are plain text.
    const optEncrypt = (v: string | undefined | null) =>
      v && v.trim() ? encrypt(v.trim()) : null;
    const extraBankFields = bankDetails
      ? {
          iban: optEncrypt(bankDetails.iban),
          routingNumber: optEncrypt(bankDetails.routingNumber),
          ccCode: bankDetails.ccCode?.trim() || null,
          bankAddress: bankDetails.bankAddress?.trim() || null,
        }
      : {};

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
          ...extraBankFields,
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
          ...extraBankFields,
          submittedAt: now,
        },
      });
    }

    // 5. Create or update ContentSubmission
    const cleanVideoLinks = isContentType && Array.isArray(videoLinks)
      ? (videoLinks as string[]).map((l: string) => l.trim()).filter(Boolean)
      : [];
    const cleanVideoFiles = isContentType && Array.isArray(videoFiles)
      ? (videoFiles as Array<{ gcsPath: string; name?: string; size?: number; type?: string }>).map((f) => ({
          gcsPath: f.gcsPath,
          name: typeof f.name === "string" ? f.name : "video",
          size: typeof f.size === "number" ? f.size : 0,
          type: typeof f.type === "string" ? f.type : "video/mp4",
        }))
      : [];

    let submission;
    if (tokenRecord.contentSubmissionId) {
      submission = await prisma.contentSubmission.update({
        where: { id: tokenRecord.contentSubmissionId },
        data: {
          videoLinks: cleanVideoLinks,
          videoFiles: cleanVideoFiles,
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
                ...extraBankFields,
              }
            : {}),
        },
      });
    } else {
      submission = await prisma.contentSubmission.create({
        data: {
          influencerId: tokenRecord.influencerId,
          videoLinks: cleanVideoLinks,
          videoFiles: cleanVideoFiles,
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
                ...extraBankFields,
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
    const totalVideos = cleanVideoLinks.length + cleanVideoFiles.length;
    const activityTitle = isContentType
      ? "Content submitted"
      : "Payment details submitted";
    const activityDetail = isContentType
      ? `${influencerName} submitted ${totalVideos} video${totalVideos !== 1 ? "s" : ""}${shouldIncludePayment && bankDetails ? " and payment details" : ""}`
      : `${influencerName} submitted payment details`;

    await prisma.activityLog.create({
      data: {
        influencerId: tokenRecord.influencerId,
        type: "content_submission",
        title: activityTitle,
        detail: activityDetail,
      },
    });

    // 7. Bell notifications
    // Broadcast content-submission notice (unchanged, visible to all)
    await prisma.notification.create({
      data: {
        type: "content_submitted",
        status: "info",
        title: activityTitle,
        message: activityDetail,
      },
    });

    // If bank details were submitted, also fan-out a finance-scoped alert
    // so only users with payments.write see it in their bell.
    if (shouldIncludePayment && bankDetails) {
      await notifyPaymentsTeam({
        type: "payment_submitted",
        status: "info",
        title: `Payment details submitted — ${influencerName}`,
        message: `@${tokenRecord.influencer.username} submitted bank details. Ready to create a payment record.`,
      });
    }

    // 8. Email the user who originally sent this form
    await notifySubmissionReceived({
      createdById: tokenRecord.createdById,
      influencerName,
      influencerId: tokenRecord.influencerId,
      title: activityTitle,
      detail: activityDetail,
      hint: isContentType
        ? "Please review and verify the submitted content in the dashboard."
        : "Bank details are ready — create a payment record when you're ready.",
    });

    return NextResponse.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error("[POST /api/portal/submit-content]", error);
    return NextResponse.json(
      { error: "Failed to process submission" },
      { status: 500 },
    );
  }
}
