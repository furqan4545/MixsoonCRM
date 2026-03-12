import puppeteer from "puppeteer";
import { getSignedUrl } from "./gcs-upload";

/**
 * Generate a PDF from HTML content with an optional signature image.
 */
export async function generateContractPdf(params: {
  htmlContent: string;
  signatureDataUrl?: string;
  influencerName?: string;
  signedDate?: string;
}): Promise<Buffer> {
  const { htmlContent, signatureDataUrl, influencerName, signedDate } = params;

  const signatureSection = signatureDataUrl
    ? `
      <div style="margin-top: 40px; border-top: 1px solid #ccc; padding-top: 20px;">
        <p style="margin-bottom: 8px; font-weight: bold;">Signature:</p>
        <img src="${signatureDataUrl}" style="max-width: 300px; max-height: 150px;" />
        <p style="margin-top: 8px; color: #666; font-size: 12px;">
          ${influencerName ? `Signed by: ${influencerName}` : ""}
          ${signedDate ? ` on ${signedDate}` : ""}
        </p>
      </div>
    `
    : "";

  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 800px;
          margin: 0 auto;
          padding: 40px;
        }
        h1, h2, h3 { color: #111; }
        p { margin: 8px 0; }
        ul, ol { padding-left: 24px; }
      </style>
    </head>
    <body>
      ${htmlContent}
      ${signatureSection}
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    const pdfUint8 = await page.pdf({
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
      printBackground: true,
    });
    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}

/**
 * Download a PDF from GCS by its gcs:// URL.
 * Returns the raw Buffer.
 */
export async function downloadPdfFromGcs(gcsUrl: string): Promise<Buffer> {
  const signedUrl = await getSignedUrl(gcsUrl);
  if (!signedUrl) throw new Error(`Cannot resolve GCS URL: ${gcsUrl}`);

  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}
