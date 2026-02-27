import { plainTextToLinkedHtml } from "@/app/lib/email-rich-text";

const DATA_IMAGE_REGEX =
  /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\n\r]+$/;

type StoredSignatureV1 = {
  version: 1;
  text: string;
  imageDataUrl: string | null;
};

function escapeAttribute(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseStoredSignature(raw: string | null | undefined): {
  text: string;
  imageDataUrl: string | null;
  rawHtml: string | null;
} {
  const value = (raw ?? "").trim();
  if (!value) return { text: "", imageDataUrl: null, rawHtml: null };

  try {
    const parsed = JSON.parse(value) as StoredSignatureV1;
    if (parsed?.version === 1) {
      const text =
        typeof parsed.text === "string"
          ? parsed.text.replace(/\r\n/g, "\n")
          : "";
      const imageDataUrl =
        typeof parsed.imageDataUrl === "string" &&
        DATA_IMAGE_REGEX.test(parsed.imageDataUrl)
          ? parsed.imageDataUrl
          : null;
      return { text, imageDataUrl, rawHtml: null };
    }
  } catch {}

  if (value.startsWith("<")) {
    return { text: "", imageDataUrl: null, rawHtml: value };
  }

  return { text: value, imageDataUrl: null, rawHtml: null };
}

export function serializeStoredSignature(input: {
  text?: string;
  imageDataUrl?: string | null;
}): string | null {
  const text = (input.text ?? "").replace(/\r\n/g, "\n").trim();
  const imageDataUrl =
    typeof input.imageDataUrl === "string" &&
    DATA_IMAGE_REGEX.test(input.imageDataUrl)
      ? input.imageDataUrl
      : null;

  if (!text && !imageDataUrl) return null;

  const payload: StoredSignatureV1 = {
    version: 1,
    text,
    imageDataUrl,
  };
  return JSON.stringify(payload);
}

export function signatureToHtml(raw: string | null | undefined): string {
  const parsed = parseStoredSignature(raw);
  if (parsed.rawHtml) return parsed.rawHtml;

  const parts: string[] = [];
  if (parsed.imageDataUrl) {
    parts.push(
      `<div><img src="${escapeAttribute(parsed.imageDataUrl)}" alt="Signature image" style="max-width:220px;height:auto;display:block;border-radius:6px;" /></div>`,
    );
  }
  if (parsed.text.trim()) {
    parts.push(plainTextToLinkedHtml(parsed.text.trim()));
  }

  return parts.join("<div><br></div>");
}
