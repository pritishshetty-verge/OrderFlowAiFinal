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
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import type { User } from "@shared/schema";

type UserRole = "admin" | "agent" | "recovery_agent" | "chat_support";

type MenuItem = {
  title: string;
  url?: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: SubMenuItem[];
  /**
   * When true, the menu item renders a "Soon" badge and is not
   * clickable. Use for in-flight modules so users see the surface
   * exists without being able to navigate into half-built screens.
   */
  comingSoon?: boolean;
  /**
   * Visibility allowlist. When set, only users with one of these
   * roles see the item. Undefined = visible to anyone whose role
   * matches the menu array this item lives in (the role-specific
   * arrays below already segment by role; this prop is for
   * exceptions like Abandoned Carts in the admin tree where we
   * want admins + recovery_agents only, NOT plain agents).
   */
  allowedRoles?: UserRole[];
};

type SubMenuItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  /** See MenuItem.comingSoon. */
  comingSoon?: boolean;
  /** See MenuItem.allowedRoles. */
  allowedRoles?: UserRole[];
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
        // Coming-soon: page exists but the underlying fulfillment
        // pipeline (Shiprocket / Delhivery courier-selection +
        // bulk-ship flow) isn't merchant-ready for multi-store yet.
        // Renders the "Soon" badge and is non-clickable until the
        // backend ships. See app-sidebar's sub-item renderer.
        title: "Fulfil",
        url: "/fulfil",
        icon: PackageCheck,
        comingSoon: true,
      },
      {
        // Coming-soon: NDR webhooks land cleanly, but the
        // reattempt-action + bulk-rescue UX is still in design.
        // Title shortened from "NDR Management" → "NDR" since the
        // sub-menu already sits inside the Orders parent, so the
        // disambiguation is implicit. Tighter copy, fits cleanly
        // alongside the Soon badge without truncation.
        title: "NDR",
        url: "/ndr",
        icon: AlertTriangle,
        comingSoon: true,
      },
      {
        // Coming-soon: call logging exists per-order, but the
        // global call-logs surface needs the per-store IVR
        // credential flow (Risk #2 / Phase 6 in the multi-store
        // audit) before it can be enabled for tenants.
        title: "Call Logs",
        url: "/call-logs",
        icon: Phone,
        comingSoon: true,
      },
      {
        // Abandoned Carts is operational territory for admins and
        // recovery agents. Plain "agent" role sees the rest of the
        // Orders subtree but not this — they don't action cart
        // recovery flows. The runtime filter below uses
        // `allowedRoles` to enforce this without forking the menu.
        title: "Abandoned Carts",
        url: "/abandoned-carts",
        icon: ShoppingCart,
        allowedRoles: ["admin", "recovery_agent"],
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
  // Helper: enforce a per-item allowlist when the item declares one.
  // Items without `allowedRoles` are visible to whoever the menu
  // array already says they're visible to (the v1 contract).
  const passesRoleAllowlist = (item: {
    allowedRoles?: UserRole[];
  }): boolean => !item.allowedRoles || item.allowedRoles.includes(userRole as UserRole);

  const menuItems = (isAdmin
    ? baseMenuItems
    : baseMenuItems.filter(
        (item) => !(item.url && ADMIN_ONLY_URLS.has(item.url)),
      )
  )
    // Drop items the active user role isn't allowed to see (e.g.
    // plain agents lose the Abandoned Carts sub-link via
    // `allowedRoles: ['admin', 'recovery_agent']`).
    .filter(passesRoleAllowlist)
    // Sub-menus need the same allowlist applied to their children
    // — otherwise an Orders parent that survives the top-level
    // filter would still render a forbidden sub-link.
    .map((item) =>
      item.items
        ? {
            ...item,
            items: item.items.filter(passesRoleAllowlist),
          }
        : item,
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
                                        of a hard reload (see audit bug #1
                                        from the multi-store refactor).
                                        When comingSoon is true, swap the
                                        Link for a non-interactive <span>
                                        so the row is visible but
                                        unclickable. The Soon badge anchors
                                        to the right of the row. */}
                                    {subItem.comingSoon ? (
                                      // `min-h-7` matches
                                      // SidebarMenuSubButton's
                                      // default row height so the
                                      // disabled row aligns
                                      // vertically with live links.
                                      // `min-w-0` on the title +
                                      // `truncate` are the load-
                                      // bearing pair: in a flex
                                      // layout, items with `flex-1`
                                      // default to min-width: auto
                                      // which forces the title's
                                      // intrinsic width as a floor.
                                      // Long titles like "NDR
                                      // Management" then wrapped
                                      // to two lines (audit Bug #1).
                                      // With min-w-0, the title is
                                      // free to shrink; with
                                      // truncate it ellipsises
                                      // instead of wrapping. Native
                                      // browser tooltip via `title`
                                      // preserves the full text.
                                      <span
                                        className="flex items-center gap-2 w-full min-h-7 cursor-not-allowed opacity-70"
                                        aria-disabled="true"
                                      >
                                        <subItem.icon className="h-4 w-4 shrink-0" />
                                        <span
                                          className="flex-1 min-w-0 truncate"
                                          title={subItem.title}
                                        >
                                          {subItem.title}
                                        </span>
                                        <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-4">
                                          Soon
                                        </Badge>
                                      </span>
                                    ) : (
                                      <Link href={subItem.url}>
                                        <subItem.icon className="h-4 w-4" />
                                        <span>{subItem.title}</span>
                                      </Link>
                                    )}
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
                        className={cn(
                          "hover:bg-sidebar-accent/50",
                          // Coming-soon items lose the path-active
                          // chrome (they have no path to be active
                          // at) and gain a muted, non-interactive
                          // look. The asChild render below replaces
                          // the Link with a <span> so the row stays
                          // unclickable.
                          item.comingSoon
                            ? "cursor-not-allowed opacity-70"
                            : isPathActive(item.url!)
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-muted-foreground",
                        )}
                      >
                        {/* SPA navigation via wouter's Link for live
                            items; <span> placeholder for items still
                            in build. The Soon badge anchors the row
                            visually so the user knows it's intentionally
                            disabled, not broken. */}
                        {item.comingSoon ? (
                          // Mirror the sub-item branch: min-h-7
                          // to match live-link row height,
                          // min-w-0 + truncate on the title so it
                          // ellipsises rather than wrapping when
                          // the Badge consumes right-side space.
                          <span
                            className="flex items-center gap-2 w-full min-h-7"
                            aria-disabled="true"
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span
                              className="flex-1 min-w-0 truncate"
                              title={item.title}
                            >
                              {item.title}
                            </span>
                            <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-4">
                              Soon
                            </Badge>
                          </span>
                        ) : (
                          <Link href={item.url!}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        )}
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
