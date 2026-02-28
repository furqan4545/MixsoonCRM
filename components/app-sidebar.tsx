"use client";

import {
  Bell,
  CheckSquare,
  ChevronsUpDown,
  Database,
  FileSpreadsheet,
  GitBranch,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

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
import { Badge } from "@/components/ui/badge";
import { NAV_FEATURE_MAP } from "@/app/lib/permissions-client";

const workspaceItems = [
  { title: "Pipeline", href: "/", icon: GitBranch },
  { title: "Influencers", href: "/influencers", icon: Users },
  { title: "Campaigns", href: "/campaigns", icon: Megaphone },
  { title: "Inbox", href: "/email", icon: Inbox, badge: 3 },
  { title: "Approvals", href: "/approvals", icon: CheckSquare, badge: 2 },
];

const navItems = [
  { title: "Pipeline", href: "/", icon: GitBranch },
  { title: "Data Scraper", href: "/data-scraper", icon: Database },
  { title: "Imports", href: "/imports", icon: FileSpreadsheet },
  { title: "Influencers", href: "/influencers", icon: Users },
  { title: "Campaigns", href: "/campaigns", icon: Megaphone },
  { title: "Campaign Filters", href: "/campaigns/filters", icon: Sparkles },
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
      <SidebarHeader className="h-16 border-b border-sidebar-border px-4 py-0 group-data-[collapsible=icon]:px-2">
        <Link
          href="/"
          className="flex h-full items-center gap-3 group-data-[collapsible=icon]:justify-center"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <span className="text-sm font-bold">M</span>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <span className="text-base font-bold tracking-tight">MIXSOON</span>
            <p className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/60">
              Influencer OS
            </p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems
                .filter((item) => canSeeNavItem(item.href, permissions))
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
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
                        {item.badge ? (
                          <Badge
                            variant="destructive"
                            className="ml-auto h-5 min-w-5 rounded-full px-1.5 text-[10px] font-semibold"
                          >
                            {item.badge}
                          </Badge>
                        ) : null}
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
                      {(session.user.name ?? session.user.email ?? "U").charAt(0).toUpperCase()}
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
