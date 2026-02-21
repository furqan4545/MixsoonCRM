import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register", "/pending-approval"];

/** Auth.js v5 session cookie names (dev vs prod) */
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  const names = cookieHeader.split(";").map((c) => c.trim().split("=")[0]?.trim() ?? "");
  return SESSION_COOKIE_NAMES.some((name) => names.includes(name));
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/dev")) {
    return NextResponse.next();
  }

  if (publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const cookieHeader = req.headers.get("cookie");
  if (!hasSessionCookie(cookieHeader)) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
