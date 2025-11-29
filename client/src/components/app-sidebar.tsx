import { Home, Package, Users, Settings, TrendingUp, PackageCheck, List, AlertTriangle, GraduationCap, Phone, ChevronDown } from "lucide-react";
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
import type { User } from "@shared/schema";
import logoUrl from "@assets/Orderflow_Icon[1]_1761724429427.png";

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
      {
        title: "Call Logs",
        url: "/call-logs",
        icon: Phone,
      },
    ],
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: TrendingUp,
    adminOnly: true,
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
];

interface AppSidebarProps {
  userRole?: "admin" | "manager" | "agent";
}

export function AppSidebar({ userRole = "admin" }: AppSidebarProps) {
  const userEmail = localStorage.getItem("userEmail");
  
  const { data: currentUser } = useQuery<User>({
    queryKey: [`/api/users/by-email/${userEmail}`],
    enabled: !!userEmail,
  });

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
              {menuItems
                .filter((item) => !item.adminOnly || userRole === "admin")
                .map((item) => (
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
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <ProfileDropdown 
          userRole={userRole} 
          userName={currentUser?.fullName || currentUser?.username}
          userEmail={currentUser?.email}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
