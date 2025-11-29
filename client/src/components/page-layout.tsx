import { ConnectionStatus } from "@/components/connection-status";
import { NotificationsBell } from "@/components/notifications-bell";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageLayout({ children, title, description, actions }: PageLayoutProps) {
  const isConnected = true; //todo: remove mock functionality

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
          <NotificationsBell />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
