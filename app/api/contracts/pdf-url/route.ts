import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSignedUrl } from "@/app/lib/gcs-upload";

// GET /api/contracts/pdf-url?contractId=xxx
// Returns a temporary signed GCS URL so the browser can load the PDF via react-pdf.
// Supports admin auth OR token-based auth (for portal access).
export async function GET(request: NextRequest) {
  const contractId = request.nextUrl.searchParams.get("contractId");
  const token = request.nextUrl.searchParams.get("token");

  if (!contractId) {
    return NextResponse.json(
      { error: "contractId is required" },
      { status: 400 },
    );
  }

  // Auth: either admin session or valid portal token
  if (token) {
    const tokenRecord = await prisma.onboardingToken.findUnique({
      where: { token },
    });
    if (
      !tokenRecord ||
      tokenRecord.usedAt ||
      tokenRecord.expiresAt < new Date() ||
      tokenRecord.contractId !== contractId
    ) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
  } else {
    try {
      await requirePermission("influencers", "read");
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Forbidden" },
        { status: 403 },
      );
    }
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { pdfUrl: true },
  });

  if (!contract?.pdfUrl) {
    return NextResponse.json(
      { error: "No PDF found for this contract" },
      { status: 404 },
    );
  }

  const signedUrl = await getSignedUrl(contract.pdfUrl);
  if (!signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: signedUrl });
}
