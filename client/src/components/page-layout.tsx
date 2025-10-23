import { ConnectionStatus } from "@/components/connection-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageLayout({ children, title, description, actions }: PageLayoutProps) {
  const [, setLocation] = useLocation();
  const isConnected = true; //todo: remove mock functionality

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    setLocation("/login");
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border p-4">
        <div className="flex items-center gap-3 flex-1">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          {title && (
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <ConnectionStatus connected={isConnected} />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
