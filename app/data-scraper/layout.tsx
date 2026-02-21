import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function DataScraperLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("data-scraper", "read");
  return <>{children}</>;
}
