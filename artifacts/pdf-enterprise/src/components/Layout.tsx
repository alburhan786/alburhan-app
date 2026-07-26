import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, FolderOpen, Wrench, Link2, ScrollText,
  Users, LogOut, Menu, X, ShieldCheck, User, FileText,
  ChevronRight, Bell
} from "lucide-react";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/workspace", icon: FolderOpen, label: "Workspace" },
  { href: "/tools", icon: Wrench, label: "PDF Tools" },
  { href: "/erp", icon: Link2, label: "ERP Bridge" },
  { href: "/audit", icon: ScrollText, label: "Audit Log" },
];

const ADMIN_NAV = [
  { href: "/admin", icon: Users, label: "Users & Admin" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location, navigate] = useLocation();
  const { user, logout } = useAuth();

  function isActive(href: string) {
    if (href === "/") return location === "/" || location === "";
    return location.startsWith(href);
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="flex flex-col"
        style={{
          width: sidebarOpen ? 220 : 56,
          background: "#090c14",
          borderRight: "1px solid #1e2433",
          transition: "width 0.2s",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-3 py-4"
          style={{ borderBottom: "1px solid #1e2433", minHeight: 60 }}
        >
          <div
            style={{
              width: 32, height: 32, background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={16} color="white" />
          </div>
          {sidebarOpen && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#d4d8e1", whiteSpace: "nowrap" }}>
                PDF Enterprise
              </div>
              <div style={{ fontSize: 10, color: "#4a5568", whiteSpace: "nowrap" }}>
                Al Burhan Secure
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            style={{
              marginLeft: "auto", background: "none", padding: 4,
              color: "#4a5568", flexShrink: 0,
            }}
            title="Toggle sidebar"
          >
            {sidebarOpen ? <X size={14} /> : <Menu size={14} />}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {NAV.map(({ href, icon: Icon, label }) => (
            <button
              key={href}
              className={`sidebar-item ${isActive(href) ? "active" : ""}`}
              onClick={() => navigate(href)}
              style={{ width: "100%", justifyContent: sidebarOpen ? "flex-start" : "center" }}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={16} />
              {sidebarOpen && <span>{label}</span>}
            </button>
          ))}

          {user?.role === "admin" && (
            <>
              <div style={{ height: 1, background: "#1e2433", margin: "8px 4px" }} />
              {ADMIN_NAV.map(({ href, icon: Icon, label }) => (
                <button
                  key={href}
                  className={`sidebar-item ${isActive(href) ? "active" : ""}`}
                  onClick={() => navigate(href)}
                  style={{ width: "100%", justifyContent: sidebarOpen ? "flex-start" : "center" }}
                  title={!sidebarOpen ? label : undefined}
                >
                  <Icon size={16} />
                  {sidebarOpen && <span>{label}</span>}
                </button>
              ))}
            </>
          )}
        </nav>

        {/* User info */}
        <div style={{ borderTop: "1px solid #1e2433", padding: "10px 8px" }}>
          <button
            className="sidebar-item"
            onClick={() => navigate("/profile")}
            style={{ width: "100%", justifyContent: sidebarOpen ? "flex-start" : "center" }}
            title={!sidebarOpen ? "Profile" : undefined}
          >
            <div
              style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
              }}
            >
              {user?.username?.[0]?.toUpperCase() || "U"}
            </div>
            {sidebarOpen && (
              <div style={{ overflow: "hidden", flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#d4d8e1", truncate: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                  {user?.username}
                </div>
                <div style={{ fontSize: 10, color: "#4a5568", textTransform: "capitalize" }}>
                  {user?.role}
                </div>
              </div>
            )}
          </button>
          <button
            className="sidebar-item"
            onClick={handleLogout}
            style={{ width: "100%", justifyContent: sidebarOpen ? "flex-start" : "center", color: "#7f1d1d" }}
            title={!sidebarOpen ? "Sign out" : undefined}
          >
            <LogOut size={16} color="#f87171" />
            {sidebarOpen && <span style={{ color: "#f87171" }}>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
