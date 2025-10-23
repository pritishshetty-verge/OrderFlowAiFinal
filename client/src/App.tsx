import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import OrdersPage from "@/pages/orders";
import AnalyticsPage from "@/pages/analytics";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const userRole = localStorage.getItem("userRole");

  useEffect(() => {
    if (!userRole) {
      setLocation("/login");
    }
  }, [userRole, setLocation]);

  if (!userRole) {
    return null;
  }

  return <Component />;
}

function Router() {
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";
  
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
      <Route path="/orders">
        {() => <ProtectedRoute component={() => <OrdersPage userRole={userRole} />} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [location] = useLocation();
  const userRole = (localStorage.getItem("userRole") as "admin" | "manager" | "agent") || "admin";
  const isLoggedIn = localStorage.getItem("userRole");
  const isLoginPage = location === "/login";
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              {isLoggedIn && !isLoginPage && <AppSidebar userRole={userRole} />}
              <Router />
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
