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
import FulfilPage from "@/pages/fulfil";
import NDRPage from "@/pages/ndr";
import AnalyticsPage from "@/pages/analytics";
import TeamPage from "@/pages/team";
import SettingsPage from "@/pages/settings";
import ShopifySetupPage from "@/pages/shopify-setup";
import ShopifyWebhooksPage from "@/pages/shopify-webhooks";
import LearningCenterPage from "@/pages/learning-center";
import CourseDetailPage from "@/pages/course-detail";
import LessonPage from "@/pages/lesson";
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
      <Route path="/fulfil">
        {() => <ProtectedRoute component={FulfilPage} />}
      </Route>
      <Route path="/ndr">
        {() => <ProtectedRoute component={NDRPage} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} />}
      </Route>
      <Route path="/team">
        {() => <ProtectedRoute component={TeamPage} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={SettingsPage} />}
      </Route>
      <Route path="/settings/shopify/setup">
        {() => <ProtectedRoute component={ShopifySetupPage} />}
      </Route>
      <Route path="/settings/shopify/webhooks">
        {() => <ProtectedRoute component={ShopifyWebhooksPage} />}
      </Route>
      <Route path="/learning">
        {() => <ProtectedRoute component={LearningCenterPage} />}
      </Route>
      <Route path="/learning/courses/:slug">
        {() => <ProtectedRoute component={CourseDetailPage} />}
      </Route>
      <Route path="/learning/lessons/:slug">
        {() => <ProtectedRoute component={LessonPage} />}
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
