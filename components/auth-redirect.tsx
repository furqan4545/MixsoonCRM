"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "next-auth/react";

const authPaths = ["/login", "/register", "/pending-approval"];

function isAuthPath(pathname: string) {
  return authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (isAuthPath(pathname)) return;

    const userStatus = session.user.status;
    if (userStatus === "PENDING") {
      router.replace("/pending-approval");
      return;
    }
    if (userStatus === "SUSPENDED") {
      signOut({ callbackUrl: "/login" });
    }
  }, [status, session?.user?.status, pathname, router]);

  return <>{children}</>;
}
