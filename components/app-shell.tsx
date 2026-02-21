"use client";

import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SaveProgressBar } from "@/components/save-progress-bar";
import { AiFilterProgress } from "@/components/ai-filter-progress";
import { BackgroundJobsButton } from "@/components/background-jobs-button";
import { NotificationBell } from "@/components/notification-bell";

const authPaths = ["/login", "/register", "/pending-approval"];

function isAuthPath(pathname: string) {
  return authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAuthPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
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
      <SaveProgressBar />
      <AiFilterProgress />
    </SidebarProvider>
  );
}
