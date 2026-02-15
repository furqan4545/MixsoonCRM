/**
 * Proxy TikTok CDN thumbnail URLs through our API to avoid:
 * - HEIC format (browsers don't support it)
 * - 403 Forbidden (TikTok blocks hotlinking via Referer check)
 *
 * Returns a URL like /api/thumbnail?url=<encoded original URL>
 */
export function fixThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/thumbnail?url=${encodeURIComponent(url)}`;
}
