import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { generateContractPdf } from "@/app/lib/pdf";
import { uploadToGcs } from "@/app/lib/gcs-upload";

// POST /api/contracts/[id]/sign — Public (token-based auth): sign a contract
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contractId } = await params;
    const body = await request.json();
    const { token, signatureDataUrl } = body;

    if (!token || !signatureDataUrl) {
      return NextResponse.json(
        { error: "Token and signature are required" },
        { status: 400 },
      );
    }

    // Validate token
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

    // Get contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
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

    if (contract.status === "SIGNED" || contract.status === "ACTIVE" || contract.status === "COMPLETED") {
      return NextResponse.json(
        { error: "This contract has already been signed" },
        { status: 409 },
      );
    }

    const signedDate = new Date();
    const influencerName =
      tokenRecord.influencer.displayName || tokenRecord.influencer.username;

    // Generate signed PDF
    const pdfBuffer = await generateContractPdf({
      htmlContent: contract.filledContent,
      signatureDataUrl,
      influencerName,
      signedDate: signedDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });

    // Upload to GCS
    const objectPath = `contracts/${tokenRecord.influencerId}/${contractId}-signed.pdf`;
    const signedPdfUrl = await uploadToGcs({
      buffer: pdfBuffer,
      objectPath,
      contentType: "application/pdf",
    });

    // Update contract
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: "SIGNED",
        signatureDataUrl,
        signedPdfUrl,
        signedAt: signedDate,
      },
    });

    // Mark token as used
    await prisma.onboardingToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: signedDate },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        influencerId: tokenRecord.influencerId,
        type: "contract",
        title: "Contract signed",
        detail: `${influencerName} signed the contract`,
      },
    });

    return NextResponse.json({ success: true, signedPdfUrl });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/sign]", error);
    return NextResponse.json(
      { error: "Failed to sign contract" },
      { status: 500 },
    );
  }
}
