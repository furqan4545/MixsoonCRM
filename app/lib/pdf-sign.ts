import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { type ContractField, percentToPdfCoords } from "./contract-fields";

/**
 * Overlay signature images and text onto an existing PDF
 * at the coordinates stored in the contract fields.
 */
export async function signPdfWithFields(params: {
  pdfBuffer: Buffer | Uint8Array;
  fields: ContractField[];
  signatureDataUrl: string; // base64 data URL
  influencerName: string;
  signedDate: string; // formatted date string
}): Promise<Buffer> {
  const { pdfBuffer, fields, signatureDataUrl, influencerName, signedDate } =
    params;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Decode signature image from data URL
  let signatureImage: Awaited<
    ReturnType<typeof pdfDoc.embedPng | typeof pdfDoc.embedJpg>
  > | null = null;

  if (signatureDataUrl) {
    const match = signatureDataUrl.match(
      /^data:image\/(png|jpe?g);base64,(.+)$/,
    );
    if (match) {
      const [, format, b64] = match;
      const imgBytes = Buffer.from(b64, "base64");
      signatureImage =
        format === "png"
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
    }
  }

  for (const field of fields) {
    const pageIndex = field.page - 1; // fields are 1-based
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const coords = percentToPdfCoords(field, pageWidth, pageHeight);

    switch (field.type) {
      case "signature": {
        if (!signatureImage) break;
        // Fit signature within the field bounds while preserving aspect ratio
        const imgDims = signatureImage.scale(1);
        const scale = Math.min(
          coords.width / imgDims.width,
          coords.height / imgDims.height,
        );
        const drawW = imgDims.width * scale;
        const drawH = imgDims.height * scale;
        // Center the image within the field area
        const offsetX = (coords.width - drawW) / 2;
        const offsetY = (coords.height - drawH) / 2;

        page.drawImage(signatureImage, {
          x: coords.x + offsetX,
          y: coords.y + offsetY,
          width: drawW,
          height: drawH,
        });
        break;
      }

      case "date": {
        const fontSize = Math.min(coords.height * 0.6, 14);
        page.drawText(signedDate, {
          x: coords.x + 4,
          y: coords.y + coords.height * 0.3,
          size: fontSize,
          font,
          color: rgb(0.13, 0.13, 0.13),
        });
        break;
      }

      case "name": {
        const fontSize = Math.min(coords.height * 0.6, 14);
        page.drawText(influencerName, {
          x: coords.x + 4,
          y: coords.y + coords.height * 0.3,
          size: fontSize,
          font,
          color: rgb(0.13, 0.13, 0.13),
        });
        break;
      }
    }
  }

  const signedBytes = await pdfDoc.save();
  return Buffer.from(signedBytes);
}
