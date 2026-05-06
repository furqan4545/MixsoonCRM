import { type NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import path from "node:path";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB
const MAX_LABEL = "20 GB";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/3gpp",
]);

let cachedStorage: Storage | null = null;
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

// POST /api/portal/upload-video
// Returns a signed PUT URL so the browser can upload the file directly to GCS,
// bypassing Next.js / Vercel body-size limits.
//
// Body: { token: string, fileName: string, contentType: string, size: number }
// Response: { uploadUrl, gcsPath }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, fileName, contentType, size } = body as {
      token?: string;
      fileName?: string;
      contentType?: string;
      size?: number;
    };

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }
    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "fileName is required" }, { status: 400 });
    }
    if (!contentType || typeof contentType !== "string") {
      return NextResponse.json({ error: "contentType is required" }, { status: 400 });
    }
    if (typeof size !== "number" || size <= 0) {
      return NextResponse.json({ error: "size is required" }, { status: 400 });
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Storage limit exceeded — "${fileName}" is ${formatBytes(size)}. The maximum size per file is ${MAX_LABEL}. Please compress the video or split it into smaller files.`,
        },
        { status: 413 },
      );
    }
    const looksLikeVideo =
      ALLOWED_TYPES.has(contentType) || /\.(mp4|mov|webm|mkv|m4v|3gp|mpeg)$/i.test(fileName);
    if (!looksLikeVideo) {
      return NextResponse.json(
        {
          error:
            "Only video files are accepted. Supported formats: MP4, MOV, WebM, MKV, M4V, 3GP, MPEG.",
        },
        { status: 415 },
      );
    }

    const tokenRecord = await prisma.onboardingToken.findUnique({
      where: { token },
      select: {
        id: true,
        type: true,
        usedAt: true,
        expiresAt: true,
        influencerId: true,
      },
    });
    if (!tokenRecord) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }
    if (tokenRecord.usedAt) {
      return NextResponse.json({ error: "Link already used" }, { status: 410 });
    }
    if (tokenRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }
    if (tokenRecord.type !== "CONTENT") {
      return NextResponse.json(
        { error: "This link does not accept content uploads" },
        { status: 400 },
      );
    }

    const bucketName = process.env.GCS_BUCKET_NAME?.trim();
    if (!bucketName) {
      return NextResponse.json(
        { error: "Storage is not configured" },
        { status: 500 },
      );
    }

    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "video";
    const objectPath = `content-submissions/${tokenRecord.influencerId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const gcsPath = `gcs://${bucketName}/${objectPath}`;

    const storage = getStorage();
    const [uploadUrl] = await storage
      .bucket(bucketName)
      .file(objectPath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        contentType,
      });

    return NextResponse.json({ uploadUrl, gcsPath });
  } catch (error) {
    console.error("[POST /api/portal/upload-video]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to issue upload URL" },
      { status: 500 },
    );
  }
}
