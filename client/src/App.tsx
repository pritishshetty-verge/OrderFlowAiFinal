import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ScopeProvider } from "@/contexts/scope-context";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import OverviewPage from "@/pages/analytics";
import ParePage from "@/pages/pare";
import OrdersPage from "@/pages/orders";
import FulfilPage from "@/pages/fulfil";
import NDRPage from "@/pages/ndr";
import TeamPage from "@/pages/team";
import SettingsPage from "@/pages/settings";
import ProfilePage from "@/pages/profile";
import ShopifySetupPage from "@/pages/shopify-setup";
import ShopifyWebhooksPage from "@/pages/shopify-webhooks";
import LearningCenterPage from "@/pages/learning-center";
import CourseDetailPage from "@/pages/course-detail";
import LessonPage from "@/pages/lesson";
import AdminLearningDashboard from "@/pages/admin-learning-dashboard";
import AdminCourseForm from "@/pages/admin-course-form";
import AdminLessonForm from "@/pages/admin-lesson-form";
import CallLogsPage from "@/pages/call-logs";
import AbandonedCartsPage from "@/pages/AbandonedCarts";
import LearningCenterPlaceholder from "@/pages/LearningCenter";
import TeamsPlaceholder from "@/pages/Teams";
import WebhooksSettingsPage from "@/pages/webhooks-settings";
import WebhookLogsPage from "@/pages/webhook-logs";
import IntegrationsPage from "@/pages/integrations";
import PayrollPage from "@/pages/payroll";
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

const RECOVERY_AGENT_ALLOWED_PATHS = [
  "/orders",
  "/abandoned-carts",
  "/learning-center",
  "/teams",
  "/profile",
  "/login",
  "/signup",
];

function RecoveryAgentGuard({ component: Component }: { component: React.ComponentType }) {
  const [location] = useLocation();
  const userRole = localStorage.getItem("userRole");

  if (userRole === "recovery_agent") {
    const isAllowed = RECOVERY_AGENT_ALLOWED_PATHS.some(
      (path) => location === path || location.startsWith(path + "/")
    );
    if (!isAllowed) {
      return <Redirect to="/abandoned-carts" />;
    }
  }

  return <ProtectedRoute component={Component} />;
}

// Admin-only guard — stricter superset of ProtectedRoute. Use for routes
// like /pare (Clean Revenue analytics) that agents and recovery_agents
// must not see. If the user is signed-in-but-not-admin, bounce them to
// the Overview page (/). Signed-out users fall through to
// ProtectedRoute's /login redirect.
function AdminOnlyGuard({ component: Component }: { component: React.ComponentType }) {
  const userRole = localStorage.getItem("userRole");

  if (userRole && userRole !== "admin") {
    return <Redirect to="/" />;
  }

  return <ProtectedRoute component={Component} />;
}

function Router() {
  const userRole = localStorage.getItem("userRole") || "admin";
  
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/">
        {() => <RecoveryAgentGuard component={OverviewPage} />}
      </Route>
      <Route path="/orders">
        {() => <ProtectedRoute component={() => <OrdersPage userRole={userRole as any} />} />}
      </Route>
      <Route path="/fulfil">
        {() => <RecoveryAgentGuard component={FulfilPage} />}
      </Route>
      <Route path="/ndr">
        {() => <RecoveryAgentGuard component={NDRPage} />}
      </Route>
      <Route path="/team">
        {() => <RecoveryAgentGuard component={TeamPage} />}
      </Route>
      <Route path="/pare">
        {() => <AdminOnlyGuard component={ParePage} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={ProfilePage} />}
      </Route>
      <Route path="/settings">
        {() => <RecoveryAgentGuard component={SettingsPage} />}
      </Route>
      <Route path="/settings/shopify/setup">
        {() => <RecoveryAgentGuard component={ShopifySetupPage} />}
      </Route>
      <Route path="/settings/shopify/webhooks">
        {() => <RecoveryAgentGuard component={ShopifyWebhooksPage} />}
      </Route>
      <Route path="/learning">
        {() => <RecoveryAgentGuard component={LearningCenterPage} />}
      </Route>
      <Route path="/learning/courses/:slug">
        {() => <RecoveryAgentGuard component={CourseDetailPage} />}
      </Route>
      <Route path="/learning/lessons/:slug">
        {() => <RecoveryAgentGuard component={LessonPage} />}
      </Route>
      <Route path="/learning/admin">
        {() => <RecoveryAgentGuard component={AdminLearningDashboard} />}
      </Route>
      <Route path="/learning/admin/courses/:id">
        {() => <RecoveryAgentGuard component={AdminCourseForm} />}
      </Route>
      <Route path="/learning/admin/lessons/:id">
        {() => <RecoveryAgentGuard component={AdminLessonForm} />}
      </Route>
      <Route path="/call-logs">
        {() => <RecoveryAgentGuard component={CallLogsPage} />}
      </Route>
      <Route path="/abandoned-carts">
        {() => <ProtectedRoute component={AbandonedCartsPage} />}
      </Route>
      <Route path="/learning-center">
        {() => <RecoveryAgentGuard component={LearningCenterPlaceholder} />}
      </Route>
      <Route path="/teams">
        {() => <RecoveryAgentGuard component={TeamsPlaceholder} />}
      </Route>
      <Route path="/webhooks">
        {() => <RecoveryAgentGuard component={WebhooksSettingsPage} />}
      </Route>
      <Route path="/api-logs">
        {() => <RecoveryAgentGuard component={WebhookLogsPage} />}
      </Route>
      <Route path="/integrations">
        {() => <AdminOnlyGuard component={IntegrationsPage} />}
      </Route>
      <Route path="/payroll">
        {() => <AdminOnlyGuard component={PayrollPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [location] = useLocation();
  const userRole = localStorage.getItem("userRole") || "admin";
  const isLoggedIn = localStorage.getItem("userRole");
  const isLoginPage = location === "/login";
  const isSignupPage = location.startsWith("/signup");
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <ScopeProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                {isLoggedIn && !isLoginPage && !isSignupPage && <AppSidebar userRole={userRole} />}
                <Router />
              </div>
            </SidebarProvider>
            <Toaster />
          </ScopeProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
