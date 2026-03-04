import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrRedirect("alerts", "read");
  return <>{children}</>;
}
