import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function ApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrRedirect("approvals", "read");
  return <>{children}</>;
}
