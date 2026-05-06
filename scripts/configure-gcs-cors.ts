#!/usr/bin/env npx tsx
/**
 * Configure CORS on the GCS bucket so the browser can PUT video files
 * directly via signed URLs (used by /api/portal/upload-video).
 *
 * Reads GCS_BUCKET_NAME and GCP_SERVICE_ACCOUNT_JSON (or
 * GOOGLE_APPLICATION_CREDENTIALS) from env. Run once after deployment
 * and any time you add a new origin.
 *
 * Usage:
 *   npx tsx scripts/configure-gcs-cors.ts
 *   npx tsx scripts/configure-gcs-cors.ts https://your-prod-domain.com
 */

import path from "node:path";
import { Storage } from "@google-cloud/storage";

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

async function main() {
  const extraOrigins = process.argv.slice(2);
  const origins = [...DEFAULT_ORIGINS, ...extraOrigins];

  const bucketName = process.env.GCS_BUCKET_NAME?.trim();
  if (!bucketName) {
    console.error("GCS_BUCKET_NAME is not set in env.");
    process.exit(1);
  }

  const credsJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  let storage: Storage;
  if (credsJson) {
    storage = new Storage({ credentials: JSON.parse(credsJson) });
  } else {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (keyPath) {
      const resolved = path.isAbsolute(keyPath)
        ? keyPath
        : path.resolve(process.cwd(), keyPath);
      storage = new Storage({ keyFilename: resolved });
    } else {
      storage = new Storage();
    }
  }

  const bucket = storage.bucket(bucketName);
  const corsConfig = [
    {
      origin: origins,
      method: ["GET", "PUT", "POST", "HEAD"],
      responseHeader: [
        "Content-Type",
        "Content-Length",
        "Content-Disposition",
        "x-goog-resumable",
      ],
      maxAgeSeconds: 3600,
    },
  ];

  await bucket.setCorsConfiguration(corsConfig);
  console.log(`✓ CORS configured on bucket "${bucketName}"`);
  console.log("  Allowed origins:");
  for (const o of origins) console.log(`    - ${o}`);
}

main().catch((err) => {
  console.error("Failed to configure CORS:", err);
  process.exit(1);
});
