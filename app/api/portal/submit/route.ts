import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";
import { generateContractPdf, downloadPdfFromGcs } from "@/app/lib/pdf";
import { signPdfWithFields } from "@/app/lib/pdf-sign";
import { uploadToGcs } from "@/app/lib/gcs-upload";
import { getSmtpTransport } from "@/app/lib/email";
import type { ContractField } from "@/app/lib/contract-fields";

// POST /api/portal/submit — Public (token-based): unified sign + bank + shipping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, signatureDataUrl, bankDetails, shippingAddress } = body;

    if (!token || !signatureDataUrl) {
      return NextResponse.json(
        { error: "Token and signature are required" },
        { status: 400 },
      );
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
    if (tokenRecord.type !== "CONTRACT" || !tokenRecord.contractId) {
      return NextResponse.json(
        { error: "Invalid token type" },
        { status: 400 },
      );
    }

    // 2. Fetch contract
    const contract = await prisma.contract.findUnique({
      where: { id: tokenRecord.contractId },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 },
      );
    }
    if (contract.influencerId !== tokenRecord.influencerId) {
      return NextResponse.json(
        { error: "Token does not match this contract" },
        { status: 403 },
      );
    }
    if (
      contract.status === "SIGNED" ||
      contract.status === "ACTIVE" ||
      contract.status === "COMPLETED"
    ) {
      return NextResponse.json(
        { error: "This contract has already been signed" },
        { status: 409 },
      );
    }

    // 3. Validate bank details if provided
    if (bankDetails) {
      const { bankName, accountNumber, accountHolder } = bankDetails;
      if (!bankName || !accountNumber || !accountHolder) {
        return NextResponse.json(
          { error: "Bank name, account number, and account holder are required" },
          { status: 400 },
        );
      }
    }

    // 4. Validate shipping address if provided
    if (shippingAddress) {
      const { fullName, addressLine1, city, postalCode } = shippingAddress;
      if (!fullName || !addressLine1 || !city || !postalCode) {
        return NextResponse.json(
          { error: "Full name, address, city, and postal code are required" },
          { status: 400 },
        );
      }
    }

    const signedDate = new Date();
    const influencerName =
      tokenRecord.influencer.displayName || tokenRecord.influencer.username;
    const formattedDate = signedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // 5. Generate signed PDF — branch on PDF mode vs HTML mode
    const isPdfMode = !!contract.pdfUrl;
    let pdfBuffer: Buffer;

    if (isPdfMode && contract.pdfUrl) {
      // DocuSign-style: download source PDF, overlay signature/text at field coordinates
      const sourcePdf = await downloadPdfFromGcs(contract.pdfUrl);
      const fields = (contract.fields as ContractField[]) || [];
      pdfBuffer = await signPdfWithFields({
        pdfBuffer: sourcePdf,
        fields,
        signatureDataUrl,
        influencerName,
        signedDate: formattedDate,
      });
    } else {
      // Legacy HTML mode: render HTML + signature via Puppeteer
      pdfBuffer = await generateContractPdf({
        htmlContent: contract.filledContent ?? "",
        signatureDataUrl,
        influencerName,
        signedDate: formattedDate,
      });
    }

    // 6. Upload PDF to GCS
    const objectPath = `contracts/${tokenRecord.influencerId}/${contract.id}-signed.pdf`;
    const signedPdfUrl = await uploadToGcs({
      buffer: pdfBuffer,
      objectPath,
      contentType: "application/pdf",
    });

    // 7. Update contract status
    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signatureDataUrl,
        signedPdfUrl,
        signedAt: signedDate,
      },
    });

    // 8. Upsert bank details if provided
    if (bankDetails) {
      const encryptedAccountNumber = encrypt(bankDetails.accountNumber);
      const onboardingData = {
        bankName: bankDetails.bankName,
        accountNumber: encryptedAccountNumber,
        accountHolder: bankDetails.accountHolder,
        bankCode: bankDetails.bankCode || null,
        // Keep existing address fields or use defaults
        fullName: shippingAddress?.fullName || bankDetails.accountHolder,
        addressLine1: shippingAddress?.addressLine1 || "",
        addressLine2: shippingAddress?.addressLine2 || null,
        city: shippingAddress?.city || "",
        postalCode: shippingAddress?.postalCode || "",
        country: shippingAddress?.country || "South Korea",
      };

      await prisma.influencerOnboarding.upsert({
        where: { influencerId: tokenRecord.influencerId },
        create: {
          influencerId: tokenRecord.influencerId,
          ...onboardingData,
        },
        update: {
          ...onboardingData,
          submittedAt: signedDate,
        },
      });
    } else if (shippingAddress) {
      // Shipping only (no bank) — upsert with just address
      await prisma.influencerOnboarding.upsert({
        where: { influencerId: tokenRecord.influencerId },
        create: {
          influencerId: tokenRecord.influencerId,
          bankName: "",
          accountNumber: "",
          accountHolder: "",
          fullName: shippingAddress.fullName,
          addressLine1: shippingAddress.addressLine1,
          addressLine2: shippingAddress.addressLine2 || null,
          city: shippingAddress.city,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || "South Korea",
        },
        update: {
          fullName: shippingAddress.fullName,
          addressLine1: shippingAddress.addressLine1,
          addressLine2: shippingAddress.addressLine2 || null,
          city: shippingAddress.city,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || "South Korea",
          submittedAt: signedDate,
        },
      });
    }

    // 9. Mark token as used
    await prisma.onboardingToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: signedDate },
    });

    // 10. Log activity
    await prisma.activityLog.create({
      data: {
        influencerId: tokenRecord.influencerId,
        type: "contract",
        title: "Contract signed",
        detail: `${influencerName} signed the contract${bankDetails ? " and submitted bank details" : ""}${shippingAddress ? " and shipping address" : ""}`,
      },
    });

    // 11. Bell notification for admins
    await prisma.notification.create({
      data: {
        type: "contract_signed",
        status: "success",
        title: "Contract signed",
        message: `${influencerName} signed the contract`,
      },
    });

    // 12. Email alert to the sending email account
    try {
      const emailAccount = await prisma.emailAccount.findFirst();
      if (emailAccount) {
        const baseUrl =
          process.env.NEXTAUTH_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";
        const dashboardUrl = `${baseUrl}/influencers/${tokenRecord.influencerId}`;

        const alertHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #16a34a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">MIXSOON — Contract Signed ✓</h1>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; color: #333; margin: 0 0 16px;">
                <strong>${influencerName}</strong> has signed the contract.
              </p>
              <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.6;">
                The signed PDF has been saved. You can view the details in the MIXSOON dashboard.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${dashboardUrl}"
                   style="display: inline-block; background: #16a34a; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
                  View in Dashboard
                </a>
              </div>
              <p style="font-size: 12px; color: #999; margin: 24px 0 0;">
                Signed on ${formattedDate}
              </p>
            </div>
          </div>
        `;

        const transport = getSmtpTransport(emailAccount);
        await transport.sendMail({
          from: emailAccount.displayName
            ? `"${emailAccount.displayName}" <${emailAccount.emailAddress}>`
            : emailAccount.emailAddress,
          to: emailAccount.emailAddress, // Send to the same account that sent the contract
          subject: `[MIXSOON] ${influencerName} signed the contract`,
          html: alertHtml,
        });
        transport.close();
      }
    } catch (emailErr) {
      // Don't fail the signing flow if email notification fails
      console.error("[POST /api/portal/submit] Email notification failed:", emailErr);
    }

    return NextResponse.json({ success: true, signedPdfUrl });
  } catch (error) {
    console.error("[POST /api/portal/submit]", error);
    return NextResponse.json(
      { error: "Failed to process submission" },
      { status: 500 },
    );
  }
}
