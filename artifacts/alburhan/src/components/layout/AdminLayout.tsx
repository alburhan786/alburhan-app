import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, PackageSearch, Users, BookOpen, MessageSquare, LogOut, ImageIcon, UsersRound, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  const menu = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
    { icon: PackageSearch, label: "Packages", href: "/admin/packages" },
    { icon: BookOpen, label: "Bookings", href: "/admin/bookings" },
    { icon: Receipt, label: "Invoices", href: "/admin/invoices" },
    { icon: ImageIcon, label: "Gallery", href: "/admin/gallery" },
    { icon: UsersRound, label: "Hajj Groups", href: "/admin/groups" },
    { icon: Users, label: "Customers", href: "/admin/customers" },
    { icon: MessageSquare, label: "Inquiries", href: "/admin/inquiries" },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-primary-foreground flex flex-col hidden md:flex sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 border-b border-primary-foreground/10">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 brightness-0 invert" />
            <span className="font-serif font-bold text-xl text-white">Al Burhan<span className="text-accent">.</span></span>
          </Link>
          <div className="mt-2 text-xs text-primary-foreground/60">Admin Portal</div>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {menu.map(item => (
            <Link key={item.href} href={item.href}>
              <span className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${location === item.href || location.startsWith(item.href + '/') ? 'bg-accent text-accent-foreground font-medium shadow-lg' : 'hover:bg-primary-foreground/10 text-primary-foreground/80 hover:text-white'}`}>
                <item.icon size={20} />
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-primary-foreground/10">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.name || 'Administrator'}</span>
              <span className="text-xs text-primary-foreground/60 truncate w-32">{user?.mobile}</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-primary-foreground/70 hover:text-white hover:bg-primary-foreground/10" onClick={() => logout()}>
            <LogOut size={18} className="mr-3" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-border flex items-center px-8 md:hidden sticky top-0 z-10">
           <span className="font-serif font-bold text-lg text-primary">Al Burhan Admin</span>
           <div className="ml-auto">
             <Button variant="ghost" size="icon" onClick={() => logout()}>
               <LogOut size={18} />
             </Button>
           </div>
        </header>
        <div className="p-4 md:p-8 flex-1 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
