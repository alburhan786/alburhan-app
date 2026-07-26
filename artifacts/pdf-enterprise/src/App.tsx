import { Switch, Route } from "wouter";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import WorkspacePage from "@/pages/WorkspacePage";
import ToolsPage from "@/pages/ToolsPage";
import AdminPage from "@/pages/AdminPage";
import ERPBridgePage from "@/pages/ERPBridgePage";
import AuditPage from "@/pages/AuditPage";
import ProfilePage from "@/pages/ProfilePage";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Al Burhan PDF Enterprise…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Switch>
      <Route path="/pdf/" component={DashboardPage} />
      <Route path="/pdf/workspace" component={WorkspacePage} />
      <Route path="/pdf/tools" component={ToolsPage} />
      <Route path="/pdf/erp" component={ERPBridgePage} />
      <Route path="/pdf/audit" component={AuditPage} />
      <Route path="/pdf/admin" component={AdminPage} />
      <Route path="/pdf/profile" component={ProfilePage} />
      <Route>
        {() => {
          window.location.href = "/pdf/";
          return null;
        }}
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
