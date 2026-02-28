import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function CampaignFiltersLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("ai-filter", "read");
  return <>{children}</>;
}
