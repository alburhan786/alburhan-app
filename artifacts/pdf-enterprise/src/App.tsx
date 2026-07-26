import { Router, Switch, Route } from "wouter";
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
import EditorPage from "@/pages/EditorPage";

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 36, height: 36, border: "3px solid #3b82f6", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: "#4a5568", fontSize: 14 }}>Loading PDF Enterprise…</p>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/workspace" component={WorkspacePage} />
      <Route path="/tools" component={ToolsPage} />
      <Route path="/erp" component={ERPBridgePage} />
      <Route path="/audit" component={AuditPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/editor/:fileId" component={EditorPage} />
      <Route component={DashboardPage} />
    </Switch>
  );
}

export default function App() {
  return (
    <Router base="/pdf">
      <AuthProvider>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </Router>
  );
}
