import { ConnectionStatus } from "@/components/connection-status";
import { NotificationsBell } from "@/components/notifications-bell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { useScope } from "@/contexts/scope-context";
import { User, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageLayout({ children, title, description, actions }: PageLayoutProps) {
  const isConnected = true; //todo: remove mock functionality
  const userRole = localStorage.getItem("userRole");
  const isAgent = userRole === "agent";
  const { isGlobalView, setIsGlobalView } = useScope();
  const [location] = useLocation();
  const isOrdersPage = location === "/orders";

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-muted/30">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card/30 px-5 py-3.5">
        <div className="flex items-center gap-3 flex-1">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          {title && (
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {isAgent && isOrdersPage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-muted/50 border">
                  <User className={`h-3.5 w-3.5 ${!isGlobalView ? "text-primary" : "text-muted-foreground"}`} />
                  <Switch
                    id="header-scope-toggle"
                    checked={isGlobalView}
                    onCheckedChange={setIsGlobalView}
                    className="h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30"
                    data-testid="toggle-scope-view"
                  />
                  <Globe className={`h-3.5 w-3.5 ${isGlobalView ? "text-primary" : "text-muted-foreground"}`} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isGlobalView ? "Viewing all store orders" : "Viewing my assigned orders"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          <ConnectionStatus connected={isConnected} />
          <NotificationsBell />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
