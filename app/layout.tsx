import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SaveProgressBar } from "@/components/save-progress-bar";
import { AiFilterProgress } from "@/components/ai-filter-progress";
import { BackgroundJobsButton } from "@/components/background-jobs-button";
import { NotificationBell } from "@/components/notification-bell";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MIXSOON CRM",
  description: "TikTok influencer data scraping and management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
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
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
