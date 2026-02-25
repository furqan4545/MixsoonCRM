import { requirePermissionOrRedirect } from "@/app/lib/permissions";

export default async function EmailLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("email", "read");
  return <div className="h-full min-h-0 overflow-hidden">{children}</div>;
}
