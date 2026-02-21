import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function ImportsLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("imports", "read");
  return <>{children}</>;
}
