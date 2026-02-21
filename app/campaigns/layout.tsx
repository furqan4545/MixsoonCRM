import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function CampaignsLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("ai-filter", "read");
  return <>{children}</>;
}
