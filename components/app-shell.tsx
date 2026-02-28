"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AiFilterProgress } from "@/components/ai-filter-progress";
import { AppSidebar } from "@/components/app-sidebar";
import { BackgroundJobsButton } from "@/components/background-jobs-button";
import { EmailSidebar } from "@/components/email-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { SaveProgressBar } from "@/components/save-progress-bar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const authPaths = ["/login", "/register", "/pending-approval"];

function isAuthPath(pathname: string) {
  return authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isEmailPath(pathname: string) {
  return pathname === "/email" || pathname.startsWith("/email/");
}

function SidebarAutoCollapse() {
  const pathname = usePathname();
  const { setOpen } = useSidebar();

  useEffect(() => {
    setOpen(!isEmailPath(pathname));
  }, [pathname, setOpen]);

  return null;
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showEmailSidebar = isEmailPath(pathname);

  return (
    <>
      <AppSidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-14 items-center justify-end gap-1 border-b px-4">
          <BackgroundJobsButton />
          <NotificationBell />
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {showEmailSidebar && <EmailSidebar />}
          <main
            className={cn(
              "min-h-0 min-w-0 flex-1",
              showEmailSidebar
                ? "overflow-hidden"
                : "overflow-auto overscroll-contain",
            )}
          >
            {children}
          </main>
        </div>
      </div>
      <SidebarAutoCollapse />
      <SaveProgressBar />
      <AiFilterProgress />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAuthPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  );
}
