import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function AiFilterLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("ai-filter", "read");
  return <>{children}</>;
}
