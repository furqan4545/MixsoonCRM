import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function AdminLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("users", "read");
  return <>{children}</>;
}
