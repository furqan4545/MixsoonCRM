import crypto from "node:crypto";
import path from "node:path";
import { Storage } from "@google-cloud/storage";

const GCS_SCHEME = "gcs://";
const EMAIL_ATTACHMENTS_PREFIX = "email-attachments";

let cachedStorage: Storage | null = null;

export type StoredEmailAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
};

export type PersistableAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export async function persistEmailAttachments(
  accountId: string,
  emailId: string,
  attachments: PersistableAttachment[],
): Promise<void> {
  if (attachments.length === 0) return;

  const bucketName = getBucketName();
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is required for email attachments");
  }

  await persistToGcs(bucketName, accountId, emailId, attachments);
}

export async function listEmailAttachments(
  accountId: string,
  emailId: string,
): Promise<StoredEmailAttachment[]> {
  const bucketName = getBucketName();
  if (!bucketName) return [];

  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const prefix = attachmentPrefix(accountId, emailId);
  const [files] = await bucket.getFiles({ prefix });

  return files.map((file) => {
    const pathValue = `${GCS_SCHEME}${bucketName}/${file.name}`;
    const meta = file.metadata;
    const filename =
      meta?.metadata?.originalFilename ||
      file.name
        .split("/")
        .pop()
        ?.replace(/^[^-]+-/, "") ||
      "attachment";
    const mimeType = meta?.contentType || "application/octet-stream";
    const size = Number(meta?.size ?? 0);

    return {
      id: encodeAttachmentId(file.name),
      filename,
      mimeType,
      size: Number.isFinite(size) ? size : 0,
      storagePath: pathValue,
    };
  });
}

export async function readEmailAttachmentById(
  accountId: string,
  emailId: string,
  attachmentId: string,
): Promise<{ buffer: Buffer; filename: string; mimeType: string } | null> {
  const bucketName = getBucketName();
  if (!bucketName) return null;

  const objectPath = decodeAttachmentId(attachmentId);
  if (!objectPath) return null;
  const prefix = attachmentPrefix(accountId, emailId);
  if (!objectPath.startsWith(prefix)) return null;

  const storage = getStorage();
  const file = storage.bucket(bucketName).file(objectPath);

  try {
    const [buf, meta] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    const filename =
      meta[0]?.metadata?.originalFilename ||
      objectPath
        .split("/")
        .pop()
        ?.replace(/^[^-]+-/, "") ||
      "attachment";
    const mimeType = meta[0]?.contentType || "application/octet-stream";
    return {
      buffer: Buffer.from(buf[0]),
      filename,
      mimeType,
    };
  } catch {
    return null;
  }
}

export async function deleteEmailAttachments(
  accountId: string,
  emailId: string,
): Promise<void> {
  const bucketName = getBucketName();
  if (!bucketName) return;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const prefix = attachmentPrefix(accountId, emailId);
  const [files] = await bucket.getFiles({ prefix });
  await Promise.allSettled(
    files.map((file) => file.delete({ ignoreNotFound: true })),
  );
}

export async function deleteAllAccountEmailAttachments(
  accountId: string,
): Promise<void> {
  const bucketName = getBucketName();
  if (!bucketName) return;
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const prefix = `${EMAIL_ATTACHMENTS_PREFIX}/${sanitizePathSegment(accountId)}/`;
  const [files] = await bucket.getFiles({ prefix });
  await Promise.allSettled(
    files.map((file) => file.delete({ ignoreNotFound: true })),
  );
}

export function buildAttachmentUrl(
  emailId: string,
  attachmentId: string,
): string {
  return `/api/email/${emailId}/attachments/${attachmentId}`;
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim() || "attachment";
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getBucketName(): string | null {
  const value = process.env.GCS_BUCKET_NAME?.trim();
  return value || null;
}

function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;

  const credsJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (credsJson) {
    cachedStorage = new Storage({ credentials: JSON.parse(credsJson) });
    return cachedStorage;
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);
    cachedStorage = new Storage({ keyFilename: resolved });
    return cachedStorage;
  }

  cachedStorage = new Storage();
  return cachedStorage;
}

async function persistToGcs(
  bucketName: string,
  accountId: string,
  emailId: string,
  attachments: PersistableAttachment[],
): Promise<void> {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const base = attachmentPrefix(accountId, emailId);

  for (const attachment of attachments) {
    const id = crypto.randomUUID();
    const safeName = sanitizeFilename(attachment.filename);
    const objectPath = `${base}/${id}-${safeName}`;
    await bucket.file(objectPath).save(attachment.content, {
      resumable: false,
      contentType: attachment.mimeType,
      metadata: {
        cacheControl: "private, max-age=0, no-store",
        metadata: {
          originalFilename: attachment.filename,
        },
      },
    });
  }
}

function attachmentPrefix(accountId: string, emailId: string): string {
  return `${EMAIL_ATTACHMENTS_PREFIX}/${sanitizePathSegment(accountId)}/${sanitizePathSegment(emailId)}`;
}

function encodeAttachmentId(objectPath: string): string {
  return Buffer.from(objectPath, "utf8").toString("base64url");
}

function decodeAttachmentId(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
