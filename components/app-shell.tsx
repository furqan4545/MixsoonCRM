"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { EmailSidebar } from "@/components/email-sidebar";
import { SaveProgressBar } from "@/components/save-progress-bar";
import { AiFilterProgress } from "@/components/ai-filter-progress";
import { BackgroundJobsButton } from "@/components/background-jobs-button";
import { NotificationBell } from "@/components/notification-bell";

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
      {showEmailSidebar && <EmailSidebar />}
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <SidebarTrigger />
          <div className="flex items-center gap-1">
            <BackgroundJobsButton />
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
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
    <SidebarProvider>
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  );
}
