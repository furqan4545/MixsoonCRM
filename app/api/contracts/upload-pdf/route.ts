import { type NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import libre from "libreoffice-convert";
import { promisify } from "node:util";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { uploadToGcs } from "@/app/lib/gcs-upload";

const convertAsync = promisify(libre.convert);

// POST /api/contracts/upload-pdf
// Accept .docx or .pdf, convert if needed, upload to GCS, return URL + page count
export async function POST(request: NextRequest) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const contractId = formData.get("contractId") as string | null;

    if (!file || !contractId) {
      return NextResponse.json(
        { error: "file and contractId are required" },
        { status: 400 },
      );
    }

    // Validate file type
    const name = file.name.toLowerCase();
    const isDocx =
      name.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";

    if (!isDocx && !isPdf) {
      return NextResponse.json(
        { error: "Only .docx and .pdf files are supported" },
        { status: 400 },
      );
    }

    // Max 25 MB
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 25 MB" },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    let pdfBuffer: Buffer;

    if (isDocx) {
      // Convert .docx → PDF via LibreOffice
      const docxBuffer = Buffer.from(arrayBuffer);
      pdfBuffer = await convertAsync(docxBuffer, ".pdf", undefined);
    } else {
      pdfBuffer = Buffer.from(arrayBuffer);
    }

    // Count pages
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    // Upload to GCS
    const objectPath = `contracts/source/${contractId}.pdf`;
    const pdfUrl = await uploadToGcs({
      buffer: pdfBuffer,
      objectPath,
      contentType: "application/pdf",
    });

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "Failed to upload PDF to storage" },
        { status: 500 },
      );
    }

    // Update contract record
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        pdfUrl,
        filledContent: null, // Clear HTML content — this is now a PDF contract
      },
    });

    return NextResponse.json({ pdfUrl, pageCount });
  } catch (error) {
    console.error("[POST /api/contracts/upload-pdf]", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 },
    );
  }
}
