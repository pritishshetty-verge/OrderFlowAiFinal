import { Home, Package, Users, Settings, PackageCheck, List, AlertTriangle, GraduationCap, Phone, ChevronDown, ShoppingCart, FileJson, Activity, Plug, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { StoreSwitcher } from "@/components/store-switcher";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { User } from "@shared/schema";

type MenuItem = {
  title: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: SubMenuItem[];
};

type SubMenuItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

const adminMenuItems: MenuItem[] = [
  {
    title: "Overview",
    url: "/",
    icon: Home,
  },
  {
    title: "Pare",
    url: "/pare",
    icon: Activity,
  },
  {
    title: "Orders",
    icon: Package,
    items: [
      {
        title: "All Orders",
        url: "/orders",
        icon: List,
      },
      {
        title: "Fulfil",
        url: "/fulfil",
        icon: PackageCheck,
      },
      {
        title: "NDR Management",
        url: "/ndr",
        icon: AlertTriangle,
      },
      {
        title: "Call Logs",
        url: "/call-logs",
        icon: Phone,
      },
      {
        title: "Abandoned Carts",
        url: "/abandoned-carts",
        icon: ShoppingCart,
      },
    ],
  },
  {
    title: "Learning Center",
    url: "/learning",
    icon: GraduationCap,
  },
  {
    title: "Team",
    url: "/team",
    icon: Users,
  },
  {
    title: "Payroll",
    url: "/payroll",
    icon: Wallet,
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Plug,
  },
  // "Webhooks" intentionally removed from the sidebar — it's now
  // surfaced as the action button on the Custom Webhooks card inside
  // /integrations to declutter primary navigation.
  {
    title: "API Logs",
    url: "/api-logs",
    icon: FileJson,
  },
];

const recoveryAgentMenuItems: MenuItem[] = [
  {
    title: "Orders",
    url: "/orders",
    icon: Package,
  },
  {
    title: "Abandoned Carts",
    url: "/abandoned-carts",
    icon: ShoppingCart,
  },
  {
    title: "Learning Center",
    url: "/learning-center",
    icon: GraduationCap,
  },
  {
    title: "Teams",
    url: "/teams",
    icon: Users,
  },
];

// Chat Support sees a deliberately tiny surface: a glanceable order
// list and a way to message the team. No fulfilment / NDR / call logs
// / abandoned-carts / payroll / integrations. Orders is rendered as a
// flat link rather than the collapsible parent that admins / agents
// see — chat support has no use for the sub-pages.
const chatSupportMenuItems: MenuItem[] = [
  {
    title: "Overview",
    url: "/",
    icon: Home,
  },
  {
    title: "Orders",
    url: "/orders",
    icon: Package,
  },
  {
    title: "Team",
    url: "/team",
    icon: Users,
  },
];

interface AppSidebarProps {
  userRole?: string;
}

export function AppSidebar({ userRole = "admin" }: AppSidebarProps) {
  const userEmail = localStorage.getItem("userEmail");
  const [location] = useLocation();
  
  const { data: currentUser } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });

  const isRecoveryAgent = userRole === "recovery_agent";
  const isChatSupport = userRole === "chat_support";
  const isAdmin = userRole === "admin";

  // Pick the per-role menu. Each role with a heavily-restricted nav
  // (recovery_agent, chat_support) gets its own dedicated array so we
  // never have to filter against a long admin-default list. The
  // open-ended `agent` role still falls through to adminMenuItems and
  // gets the ADMIN_ONLY_URLS filter applied below.
  const baseMenuItems = isRecoveryAgent
    ? recoveryAgentMenuItems
    : isChatSupport
      ? chatSupportMenuItems
      : adminMenuItems;

  // URLs that should be hidden from the sidebar for any non-admin
  // role. These match the AdminOnlyGuard routes in App.tsx (server
  // returns 403 too — this is just visual). API Logs was previously
  // visible to plain agents; locked down now per role brief.
  const ADMIN_ONLY_URLS = new Set([
    "/pare",
    "/integrations",
    "/payroll",
    "/api-logs",
  ]);
  const menuItems = isAdmin
    ? baseMenuItems
    : baseMenuItems.filter(
        (item) => !(item.url && ADMIN_ONLY_URLS.has(item.url)),
      );

  const isPathActive = (url: string) => {
    if (url === "/") return location === "/";
    return location === url || location.startsWith(url + "/");
  };

  const isParentActive = (items?: SubMenuItem[]) => {
    if (!items) return false;
    return items.some(item => isPathActive(item.url));
  };

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        {/* Phase 3: the static logo + wordmark is replaced by the
            multi-store switcher. Renders as static text for users
            with exactly one store (the steady state during rollout)
            and as a dropdown for admins / multi-store members. */}
        <StoreSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <Collapsible key={item.title} defaultOpen className="group/collapsible">
                  <SidebarMenuItem>
                    {item.items ? (
                      <>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton 
                            data-testid={`link-${item.title.toLowerCase()}`}
                            className={`hover:bg-sidebar-accent/50 ${
                              isParentActive(item.items) 
                                ? "text-foreground font-semibold" 
                                : "text-muted-foreground"
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className={`ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 ${
                              isParentActive(item.items) ? "text-foreground" : "text-muted-foreground"
                            }`} />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => {
                              const isActive = isPathActive(subItem.url);
                              return (
                                <SidebarMenuSubItem key={subItem.title}>
                                  <SidebarMenuSubButton 
                                    asChild 
                                    data-testid={`link-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}
                                    className={`hover:bg-sidebar-accent/50 ${
                                      isActive 
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {/* Wouter Link intercepts the click
                                        and triggers SPA navigation instead
                                        of a hard reload. Hard reloads
                                        re-mount StoreProvider, which used
                                        to race the /api/stores/me fetch
                                        and revert the active store to
                                        the legacy default — see audit
                                        bug #1. */}
                                    <Link href={subItem.url}>
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </>
                    ) : (
                      <SidebarMenuButton 
                        asChild 
                        data-testid={`link-${item.title.toLowerCase()}`}
                        className={`hover:bg-sidebar-accent/50 ${
                          isPathActive(item.url!) 
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                            : "text-muted-foreground"
                        }`}
                      >
                        {/* SPA navigation — see comment on the sub-menu
                            Link above. Replaces <a href> to avoid the
                            full-page reload that re-mounts the provider
                            tree. Non-null assertion matches the
                            adjacent isPathActive(item.url!) check —
                            this branch only runs for leaf items that
                            carry a url. */}
                        <Link href={item.url!}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <ProfileDropdown 
          userRole={userRole} 
          userName={currentUser?.fullName || currentUser?.username}
          userEmail={currentUser?.email}
          avatarImage={currentUser?.avatarImage ?? undefined}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
