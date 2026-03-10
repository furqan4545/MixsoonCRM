import path from "node:path";
import { Storage } from "@google-cloud/storage";

let cachedStorage: Storage | null = null;

function getBucketName(): string | null {
  return process.env.GCS_BUCKET_NAME?.trim() || null;
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

/**
 * Upload a buffer to GCS and return the gcs:// URL.
 */
export async function uploadToGcs(params: {
  buffer: Buffer;
  objectPath: string;
  contentType: string;
}): Promise<string | null> {
  const bucketName = getBucketName();
  if (!bucketName) {
    console.warn("[gcs-upload] No GCS_BUCKET_NAME configured");
    return null;
  }

  const storage = getStorage();
  const file = storage.bucket(bucketName).file(params.objectPath);

  await file.save(params.buffer, {
    resumable: false,
    contentType: params.contentType,
    metadata: {
      cacheControl: "public, max-age=31536000",
    },
  });

  return `gcs://${bucketName}/${params.objectPath}`;
}

/**
 * Generate a signed URL for temporary access to a GCS object.
 */
export async function getSignedUrl(gcsUrl: string, expiresInMs = 3600_000): Promise<string | null> {
  if (!gcsUrl.startsWith("gcs://")) return null;

  const withoutScheme = gcsUrl.slice("gcs://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0) return null;

  const bucket = withoutScheme.slice(0, slash);
  const objectPath = withoutScheme.slice(slash + 1);

  const storage = getStorage();
  const file = storage.bucket(bucket).file(objectPath);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMs,
  });

  return url;
}
