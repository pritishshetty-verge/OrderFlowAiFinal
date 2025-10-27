import { Home, Package, Users, Settings, TrendingUp, PackageCheck, List, AlertTriangle, GraduationCap } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronDown } from "lucide-react";
import logoUrl from "@assets/image_1761228744572.png";

const menuItems = [
  {
    title: "Overview",
    url: "/",
    icon: Home,
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
    ],
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: TrendingUp,
  },
  {
    title: "Learning Center",
    icon: GraduationCap,
    items: [
      {
        title: "Browse Courses",
        url: "/learning",
        icon: List,
      },
    ],
    adminItems: [
      {
        title: "Manage Courses",
        url: "/learning/admin",
        icon: Settings,
      },
    ],
  },
  {
    title: "Team",
    url: "/team",
    icon: Users,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

interface AppSidebarProps {
  userRole?: "admin" | "manager" | "agent";
}

export function AppSidebar({ userRole = "admin" }: AppSidebarProps) {
  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="OrderFlowAI Logo" className="h-10 w-10 rounded-md" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">OrderFlowAI</span>
            <span className="text-xs text-muted-foreground">Shopify Manager</span>
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
                          <SidebarMenuButton data-testid={`link-${item.title.toLowerCase()}`}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton asChild data-testid={`link-${subItem.title.toLowerCase().replace(/\s+/g, '-')}`}>
                                  <a href={subItem.url} className="hover-elevate">
                                    <subItem.icon className="h-4 w-4" />
                                    <span>{subItem.title}</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                            {userRole === "admin" && item.adminItems && item.adminItems.map((adminItem) => (
                              <SidebarMenuSubItem key={adminItem.title}>
                                <SidebarMenuSubButton asChild data-testid={`link-${adminItem.title.toLowerCase().replace(/\s+/g, '-')}`}>
                                  <a href={adminItem.url} className="hover-elevate">
                                    <adminItem.icon className="h-4 w-4" />
                                    <span>{adminItem.title}</span>
                                  </a>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </>
                    ) : (
                      <SidebarMenuButton asChild data-testid={`link-${item.title.toLowerCase()}`}>
                        <a href={item.url} className="hover-elevate">
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

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              {userRole === "admin" ? "AD" : userRole === "manager" ? "MG" : "AG"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">
              {userRole === "admin" ? "Admin User" : userRole === "manager" ? "Manager" : "Agent"}
            </span>
            <span className="text-xs text-muted-foreground capitalize">{userRole}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
