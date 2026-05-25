import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/register", "/pending-approval", "/portal"];

/** Auth.js v5 session cookie names (dev vs prod) */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const names = cookieHeader
    .split(";")
    .map((c) => c.trim().split("=")[0]?.trim() ?? "");
  return SESSION_COOKIE_NAMES.some((name) => names.includes(name));
}

/**
 * Build the public-facing origin of this request. Behind a proxy like Cloud Run,
 * `req.nextUrl.origin` returns the internal bind address (https://0.0.0.0:8080)
 * because the request is forwarded to the container on that address. Cloud Run /
 * GFE injects X-Forwarded-Host and X-Forwarded-Proto headers — those are the
 * authoritative source for the URL the user actually typed.
 *
 * Fallback chain: X-Forwarded-Host → Host header → nextUrl.origin (dev only).
 */
function getPublicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }
  const host = req.headers.get("host");
  if (host && !host.startsWith("0.0.0.0")) {
    return `${req.nextUrl.protocol}//${host}`;
  }
  return req.nextUrl.origin;
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/dev") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/onboarding/verify") ||
    pathname.startsWith("/api/onboarding/submit") ||
    pathname.startsWith("/api/portal/submit") ||
    pathname.startsWith("/api/portal/upload-video") ||
    pathname.startsWith("/api/portal/track-open") ||
    pathname.startsWith("/api/contracts/pdf-url") ||
    /^\/api\/contracts\/[^/]+\/sign$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const cookieHeader = req.headers.get("cookie");
  if (!hasSessionCookie(cookieHeader)) {
    const login = new URL("/login", getPublicOrigin(req));
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
