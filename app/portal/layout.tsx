import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MIXSOON Portal",
  description: "Influencer onboarding portal",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">M</span>
            </div>
            <div>
              <span className="text-base font-bold tracking-tight">MIXSOON</span>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Influencer Portal
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
