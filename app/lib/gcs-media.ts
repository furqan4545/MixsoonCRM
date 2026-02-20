import crypto from "node:crypto";
import path from "node:path";
import convert from "heic-convert";
import { Storage } from "@google-cloud/storage";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.tiktok.com/",
  Origin: "https://www.tiktok.com",
};

type RemoteImage = { buffer: Buffer; contentType: string };

let cachedStorage: Storage | null = null;

function getBucketName(): string | null {
  const bucket = process.env.GCS_BUCKET_NAME?.trim();
  return bucket || null;
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

function toArrayBufferView(input: ArrayBuffer | SharedArrayBuffer | Uint8Array | Buffer): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (Buffer.isBuffer(input)) return new Uint8Array(input);
  return new Uint8Array(input);
}

function sanitizeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64) || "unknown";
}

function hashUrl(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function buildCandidateUrls(url: string): string[] {
  const out = new Set<string>([url]);
  if (url.includes(".heic")) {
    out.add(url.replace(/\.heic(\?|$)/i, ".jpeg$1"));
    out.add(url.replace(/\.heic(\?|$)/i, ".jpg$1"));
    out.add(url.replace(/\.heic(\?|$)/i, ".webp$1"));
  }
  if (url.includes("format=heic")) {
    out.add(url.replace(/format=heic/gi, "format=jpeg"));
    out.add(url.replace(/format=heic/gi, "format=webp"));
  }
  return [...out];
}

async function fetchRemoteImage(url: string): Promise<RemoteImage | null> {
  for (const candidate of buildCandidateUrls(url)) {
    const response = await fetch(candidate, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
    });
    if (!response.ok) continue;

    const contentType = response.headers.get("content-type") ?? "";
    const raw = Buffer.from(await response.arrayBuffer());

    if (contentType.includes("heic") || candidate.includes(".heic")) {
      try {
        const converted = await convert({
          buffer: raw,
          format: "JPEG",
          quality: 0.8,
        });
        const out = Buffer.from(
          toArrayBufferView(converted as ArrayBuffer | Buffer),
        );
        return { buffer: out, contentType: "image/jpeg" };
      } catch {
        continue;
      }
    }

    return { buffer: raw, contentType: contentType || "image/jpeg" };
  }
  return null;
}

function extensionFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  return "jpg";
}

export function isGcsUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("gcs://");
}

export function parseGcsUrl(url: string): { bucket: string; objectPath: string } | null {
  if (!url.startsWith("gcs://")) return null;
  const withoutScheme = url.slice("gcs://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucket: withoutScheme.slice(0, slash),
    objectPath: withoutScheme.slice(slash + 1),
  };
}

export async function cacheRemoteImageToGcs(params: {
  sourceUrl: string | null | undefined;
  importId: string;
  kind: "avatars" | "thumbnails";
  username: string;
}): Promise<string | null> {
  const sourceUrl = params.sourceUrl?.trim();
  if (!sourceUrl) return null;
  if (isGcsUrl(sourceUrl)) return sourceUrl;

  const bucketName = getBucketName();
  if (!bucketName) return null;

  const remote = await fetchRemoteImage(sourceUrl);
  if (!remote) return null;

  const ext = extensionFor(remote.contentType);
  const objectPath =
    `imports/${params.importId}/${params.kind}/${sanitizeSegment(params.username)}/` +
    `${hashUrl(sourceUrl)}.${ext}`;

  const storage = getStorage();
  const file = storage.bucket(bucketName).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(remote.buffer, {
      resumable: false,
      contentType: remote.contentType,
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }

  return `gcs://${bucketName}/${objectPath}`;
}

export async function readGcsImage(url: string): Promise<{
  body: ArrayBuffer;
  contentType: string;
} | null> {
  const parsed = parseGcsUrl(url);
  if (!parsed) return null;
  const storage = getStorage();
  const file = storage.bucket(parsed.bucket).file(parsed.objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  const [meta] = await file.getMetadata();
  return {
    body: Uint8Array.from(buf).buffer,
    contentType: meta.contentType ?? "image/jpeg",
  };
}

export async function deleteImportMediaFromGcs(importId: string): Promise<{
  deletedCount: number;
  failedCount: number;
}> {
  const bucketName = getBucketName();
  if (!bucketName) return { deletedCount: 0, failedCount: 0 };

  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const prefix = `imports/${importId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return { deletedCount: 0, failedCount: 0 };

  const results = await Promise.allSettled(
    files.map((file) => file.delete({ ignoreNotFound: true })),
  );
  const failedCount = results.filter((r) => r.status === "rejected").length;
  return { deletedCount: files.length - failedCount, failedCount };
}
