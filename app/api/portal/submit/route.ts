import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";
import { generateContractPdf, downloadPdfFromGcs } from "@/app/lib/pdf";
import { signPdfWithFields } from "@/app/lib/pdf-sign";
import { uploadToGcs } from "@/app/lib/gcs-upload";
import { notifySubmissionReceived } from "@/app/lib/submission-notify";
import type { ContractField } from "@/app/lib/contract-fields";

// POST /api/portal/submit — Public (token-based): unified sign + bank + shipping
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, signatureDataUrl, fieldValues, bankDetails, shippingAddress } = body;

    // PDF mode sends fieldValues; HTML mode sends signatureDataUrl
    if (!token || (!signatureDataUrl && !fieldValues)) {
      return NextResponse.json(
        { error: "Token and signature/field values are required" },
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
      // DocuSign-style: download source PDF, overlay per-field values at stored coordinates
      const sourcePdf = await downloadPdfFromGcs(contract.pdfUrl);
      const fields = (contract.fields as ContractField[]) || [];
      const fv = (fieldValues as Record<string, string>) || {};
      pdfBuffer = await signPdfWithFields({
        pdfBuffer: sourcePdf,
        fields,
        fieldValues: fv,
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
    // For PDF mode, store the first signature from fieldValues for reference
    const sigDataUrl = isPdfMode
      ? Object.values(fieldValues || {}).find((v: string) => v?.startsWith("data:image")) || null
      : signatureDataUrl;

    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: "SIGNED",
        signatureDataUrl: sigDataUrl,
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

    // 12. Email the user who originally sent this contract
    await notifySubmissionReceived({
      createdById: tokenRecord.createdById,
      influencerName,
      influencerId: tokenRecord.influencerId,
      title: "Contract signed",
      detail: `${influencerName} has signed the contract.`,
      hint: "The signed PDF has been saved. You can view it in the MIXSOON dashboard.",
    });

    return NextResponse.json({ success: true, signedPdfUrl });
  } catch (error) {
    console.error("[POST /api/portal/submit]", error);
    return NextResponse.json(
      { error: "Failed to process submission" },
      { status: 500 },
    );
  }
}
