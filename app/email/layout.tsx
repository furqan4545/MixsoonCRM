import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function EmailLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("email", "read");
  return <>{children}</>;
}
