import { requirePermissionOrRedirect } from "@/app/lib/permissions";
import { EmailSidebar } from "@/components/email-sidebar";
import { Separator } from "@/components/ui/separator";

export default async function EmailLayout({
  children,
}: { children: React.ReactNode }) {
  await requirePermissionOrRedirect("email", "read");
  return (
    <div className="flex h-[calc(100vh-49px)]">
      <EmailSidebar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
