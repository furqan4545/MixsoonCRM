import { NextRequest, NextResponse } from "next/server";
import convert from "heic-convert";
import { isGcsUrl, readGcsImage } from "../../lib/gcs-media";

const TIKTOK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://www.tiktok.com/",
  Origin: "https://www.tiktok.com",
};

function thumbnailError() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-cache" },
  });
}

// In-memory cache: same URL = serve converted result, no re-fetch or re-convert
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CacheEntry = { body: ArrayBuffer; contentType: string; expiresAt: number };
const thumbnailCache = new Map<string, CacheEntry>();

function getCached(url: string): CacheEntry | null {
  const entry = thumbnailCache.get(url);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry;
}

function setCache(url: string, body: ArrayBuffer, contentType: string) {
  if (thumbnailCache.size >= MAX_CACHE_SIZE) {
    const firstKey = thumbnailCache.keys().next().value;
    if (firstKey) thumbnailCache.delete(firstKey);
  }
  thumbnailCache.set(url, {
    body,
    contentType,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// GET /api/thumbnail?url=... — Fetch TikTok thumbnail, convert HEIC to JPEG if needed, serve it
export async function GET(request: NextRequest) {
  try {
    const { requirePermission } = await import("@/app/lib/rbac");
    await requirePermission("influencers", "read");
  } catch {
    return new NextResponse(null, { status: 403 });
  }
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  const cached = getCached(url);
  if (cached) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Thumbnail-Cache": "HIT",
      },
    });
  }

  if (isGcsUrl(url)) {
    try {
      const gcs = await readGcsImage(url);
      if (!gcs) {
        return NextResponse.json({ error: "GCS image not found" }, { status: 404 });
      }
      setCache(url, gcs.body, gcs.contentType);
      return new NextResponse(gcs.body, {
        status: 200,
        headers: {
          "Content-Type": gcs.contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
        },
      });
    } catch (error) {
      console.error("Thumbnail GCS read error:", error);
      return thumbnailError();
    }
  }

  try {
    const response = await fetch(url, { headers: TIKTOK_HEADERS });

    if (!response.ok) {
      if (url.includes(".heic")) {
        const jpegUrl = url.replace(/\.heic(\?|$)/, ".jpeg$1");
        const jpegRes = await fetch(jpegUrl, { headers: TIKTOK_HEADERS });
        if (jpegRes.ok) {
          const buf = await jpegRes.arrayBuffer();
          setCache(url, buf, "image/jpeg");
          return new NextResponse(buf, {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400, s-maxage=604800",
            },
          });
        }
      }
      return thumbnailError();
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("heic") || url.includes(".heic")) {
      try {
        const jpegBuffer = await convert({
          buffer: Buffer.from(arrayBuffer),
          format: "JPEG",
          quality: 0.8,
        });

        const asBuffer =
          jpegBuffer instanceof ArrayBuffer
            ? Buffer.from(jpegBuffer)
            : Buffer.from(jpegBuffer as Buffer);
        const out = Uint8Array.from(asBuffer).buffer;

        setCache(url, out, "image/jpeg");

        return new NextResponse(out, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
          },
        });
      } catch (convertErr) {
        const jpegUrl = url.replace(/\.heic(\?|$)/, ".jpeg$1");
        if (jpegUrl !== url) {
          const jpegRes = await fetch(jpegUrl, { headers: TIKTOK_HEADERS });
          if (jpegRes.ok) {
            const buf = await jpegRes.arrayBuffer();
            setCache(url, buf, "image/jpeg");
            return new NextResponse(buf, {
              status: 200,
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=86400, s-maxage=604800",
              },
            });
          }
        }
        console.error("Thumbnail HEIC convert error:", convertErr);
        return thumbnailError();
      }
    }

    setCache(url, arrayBuffer, contentType || "image/jpeg");

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error("Thumbnail proxy error:", error);
    return thumbnailError();
  }
}
