import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { getSignedUrl } from "@/app/lib/gcs-upload";

// GET /api/contracts/pdf-url?contractId=xxx&type=source|signed
// Proxies the PDF bytes through the Next.js server to avoid GCS CORS issues.
// type=source (default): the original uploaded PDF for rendering in editor/signer
// type=signed: the final signed PDF for download/viewing
// Supports admin auth OR token-based auth (for portal access).
export async function GET(request: NextRequest) {
  const contractId = request.nextUrl.searchParams.get("contractId");
  const token = request.nextUrl.searchParams.get("token");
  const type = request.nextUrl.searchParams.get("type") || "source";

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
    select: { pdfUrl: true, signedPdfUrl: true },
  });

  const gcsUrl = type === "signed" ? contract?.signedPdfUrl : contract?.pdfUrl;

  if (!gcsUrl) {
    return NextResponse.json(
      { error: `No ${type} PDF found for this contract` },
      { status: 404 },
    );
  }

  const signedUrl = await getSignedUrl(gcsUrl);
  if (!signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate signed URL" },
      { status: 500 },
    );
  }

  // Proxy the PDF bytes through our server to avoid CORS issues
  const pdfRes = await fetch(signedUrl);
  if (!pdfRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch PDF from storage" },
      { status: 502 },
    );
  }

  const pdfBuffer = await pdfRes.arrayBuffer();
  const isDownload = type === "signed";

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=3600",
      ...(isDownload && {
        "Content-Disposition": `inline; filename="contract-${contractId}-signed.pdf"`,
      }),
    },
  });
}
