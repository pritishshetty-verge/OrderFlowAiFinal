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
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";
import logoUrl from "@assets/Orderflow_Icon[1]_1761724429427.png";

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
  const isAdmin = userRole === "admin";
  // Admin menu is shared with agents today, but a few entries are
  // admin-only. Filter them here so the nav matches the route guards
  // (AdminOnlyGuard in App.tsx, 403 on the server).
  const baseMenuItems = isRecoveryAgent ? recoveryAgentMenuItems : adminMenuItems;
  const ADMIN_ONLY_URLS = new Set(["/pare", "/integrations", "/payroll"]);
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
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3 text-[20px]">
          <img src={logoUrl} alt="OrderFlowAI Logo" className="h-10 w-10 rounded-md logo-spin-on-hover" />
          <div className="flex flex-col">
            <span className="font-semibold text-[16px]">OrderFlow</span>
          </div>
        </div>
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
                                    <a href={subItem.url}>
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </a>
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
                        <a href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
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
