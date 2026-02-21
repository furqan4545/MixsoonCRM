import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function NotificationsLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("notifications", "read");
  return <>{children}</>;
}
