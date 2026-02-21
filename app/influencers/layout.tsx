import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function InfluencersLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("influencers", "read");
  return <>{children}</>;
}
