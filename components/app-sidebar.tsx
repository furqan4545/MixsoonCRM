"use client";

import {
  Bell,
  ChevronsUpDown,
  Database,
  FileSpreadsheet,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { NAV_FEATURE_MAP } from "@/app/lib/permissions-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Data Scraper", href: "/data-scraper", icon: Database },
  { title: "Imports", href: "/imports", icon: FileSpreadsheet },
  { title: "Influencers", href: "/influencers", icon: Users },
  { title: "Campaign Filters", href: "/campaigns", icon: Sparkles },
  { title: "Queues", href: "/queues", icon: Layers },
  { title: "Notifications", href: "/notifications", icon: Bell },
  { title: "Email", href: "/email", icon: Mail },
];

function hasPermission(
  permissions: { feature: string; action: string }[] | undefined,
  feature: string,
  action: string,
) {
  return (permissions ?? []).some(
    (p) => p.feature === feature && p.action === action,
  );
}

function canSeeNavItem(
  href: string,
  permissions: { feature: string; action: string }[] | undefined,
) {
  const req = NAV_FEATURE_MAP[href];
  if (req == null) return true;
  return hasPermission(permissions, req.feature, req.action);
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile } = useSidebar();
  const { data: session } = useSession();
  const permissions = session?.user?.permissions ?? [];
  const showUserManagement = hasPermission(permissions, "users", "write");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:px-2">
        <Link
          href="/"
          className="flex h-full items-center gap-2 group-data-[collapsible=icon]:justify-center"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <span className="text-sm font-bold">M</span>
          </div>
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            MIXSOON
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems
                .filter((item) => canSeeNavItem(item.href, permissions))
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href)
                      }
                    >
                      <Link href={item.href}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              {showUserManagement && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="User management"
                      isActive={pathname.startsWith("/admin/users")}
                    >
                      <Link href="/admin/users">
                        <UserCog className="h-4 w-4" />
                        <span>User management</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Roles & permissions"
                      isActive={pathname.startsWith("/admin/roles")}
                    >
                      <Link href="/admin/roles">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Roles & permissions</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {session?.user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-medium">
                      {(session.user.name ?? session.user.email ?? "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {session.user.name ?? session.user.email ?? "User"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {session.user.role ?? "—"}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align="end"
                  sideOffset={4}
                >
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/login" })}
                  >
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
