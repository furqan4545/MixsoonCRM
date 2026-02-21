import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function QueuesLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("queues", "read");
  return <>{children}</>;
}
