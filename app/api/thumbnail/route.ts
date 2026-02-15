import { NextRequest, NextResponse } from "next/server";
import convert from "heic-convert";

// GET /api/thumbnail?url=... — Fetch TikTok thumbnail, convert HEIC to JPEG, serve it
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${response.status}` },
        { status: 502 },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "";

    // If HEIC, convert to JPEG
    if (contentType.includes("heic") || url.includes(".heic")) {
      const jpegBuffer = await convert({
        buffer: Buffer.from(arrayBuffer),
        format: "JPEG",
        quality: 0.8,
      });

      return new NextResponse(jpegBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400, s-maxage=604800",
        },
      });
    }

    // Otherwise pass through as-is
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error("Thumbnail proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch/convert thumbnail" },
      { status: 500 },
    );
  }
}
