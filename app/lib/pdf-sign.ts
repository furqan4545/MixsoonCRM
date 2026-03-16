import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { type ContractField, percentToPdfCoords } from "./contract-fields";

/**
 * Overlay per-field values (signatures, text) onto an existing PDF
 * at the coordinates stored in the contract fields.
 *
 * Each field gets its own value from the fieldValues map.
 */
export async function signPdfWithFields(params: {
  pdfBuffer: Buffer | Uint8Array;
  fields: ContractField[];
  fieldValues: Record<string, string>; // { fieldId: dataUrl | text }
}): Promise<Buffer> {
  const { pdfBuffer, fields, fieldValues } = params;

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Pre-embed all unique images (signatures and stamps)
  const embeddedImages = new Map<
    string,
    Awaited<ReturnType<typeof pdfDoc.embedPng | typeof pdfDoc.embedJpg>>
  >();

  for (const field of fields) {
    if (field.type !== "signature" && field.type !== "stamp") continue;
    const dataUrl = fieldValues[field.id];
    if (!dataUrl || embeddedImages.has(field.id)) continue;

    const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (match) {
      const [, format, b64] = match;
      const imgBytes = Buffer.from(b64, "base64");
      const img =
        format === "png"
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
      embeddedImages.set(field.id, img);
    }
  }

  for (const field of fields) {
    const value = fieldValues[field.id];
    if (!value) continue;

    const pageIndex = field.page - 1; // fields are 1-based
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const coords = percentToPdfCoords(field, pageWidth, pageHeight);

    switch (field.type) {
      case "signature":
      case "stamp": {
        const embeddedImage = embeddedImages.get(field.id);
        if (!embeddedImage) break;
        // Fit image within the field bounds while preserving aspect ratio
        const imgDims = embeddedImage.scale(1);
        const scale = Math.min(
          coords.width / imgDims.width,
          coords.height / imgDims.height,
        );
        const drawW = imgDims.width * scale;
        const drawH = imgDims.height * scale;
        // Center the image within the field area
        const offsetX = (coords.width - drawW) / 2;
        const offsetY = (coords.height - drawH) / 2;

        page.drawImage(embeddedImage, {
          x: coords.x + offsetX,
          y: coords.y + offsetY,
          width: drawW,
          height: drawH,
        });
        break;
      }

      case "date":
      case "name": {
        const fontSize = Math.min(coords.height * 0.6, 14);
        page.drawText(value, {
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
