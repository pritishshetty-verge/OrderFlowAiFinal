import { AppSidebar } from "../app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppSidebarExample() {
  return (
    <SidebarProvider>
      <div className="h-screen">
        <AppSidebar userRole="admin" />
      </div>
    </SidebarProvider>
  );
}
