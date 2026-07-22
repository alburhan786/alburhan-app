import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, RefreshCw, Layout, Image, FileText, MessageSquare, ExternalLink, BookOpen, Phone } from "lucide-react";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_URL || "";

export default function CmsDashboard() {
  const [gallery, setGallery] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([
        fetch(`${API}/api/gallery`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/api/packages`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
      ]);
      setGallery(Array.isArray(g) ? g : []);
      setPackages(Array.isArray(p) ? p : []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const activePackages = packages.filter(p => p.status === "active" || p.is_active).length;

  const CMS_SECTIONS = [
    { label: "Home Page", desc: "Hero, banners & announcements", href: "/", icon: Layout, status: "live" },
    { label: "Packages", desc: `${packages.length} packages (${activePackages} active)`, href: "/admin/packages", icon: BookOpen, status: "live" },
    { label: "Gallery", desc: `${gallery.length} media items`, href: "/admin/gallery", icon: Image, status: "live" },
    { label: "Blog / Knowledge", desc: "Articles & travel guides", href: "/knowledge", icon: FileText, status: "live" },
    { label: "Contact Page", desc: "Contact form & office locations", href: "/contact", icon: Phone, status: "live" },
    { label: "About Us", desc: "Company profile & team", href: "/about", icon: Globe, status: "live" },
  ];

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Globe size={18} className="text-primary" /></div>
              Website CMS
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Content management — packages, gallery, pages, and public website control</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <a href="/" target="_blank" rel="noreferrer">
              <Button size="sm" className="gap-1.5"><ExternalLink size={13} /> View Website</Button>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: BookOpen, label: "Total Packages",  val: packages.length, color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: Layout,   label: "Active Packages", val: activePackages,  color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: Image,    label: "Gallery Items",   val: gallery.length,  color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: Globe,    label: "Live Pages",      val: CMS_SECTIONS.length, color: "bg-amber-50 border-amber-200 text-amber-700" },
          ].map(k => (
            <div key={k.label} className={`rounded-2xl border p-4 ${k.color}`}>
              <k.icon size={20} className="mb-2 opacity-70" />
              <p className="text-2xl font-bold">{k.val}</p>
              <p className="text-xs mt-1 opacity-70">{k.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Website Sections</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {CMS_SECTIONS.map(s => (
              <Link key={s.href} href={s.href}>
                <div className="flex items-center justify-between p-3 rounded-xl border hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <s.icon size={15} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700">{s.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold text-sm mb-3">Recent Packages</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages created yet</p>
          ) : (
            <div className="space-y-2">
              {packages.slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{p.name || p.title || `Package ${i+1}`}</p>
                    <p className="text-xs text-muted-foreground">{p.type || p.category || "Hajj / Umrah"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">₹{Number(p.price || 0).toLocaleString("en-IN")}</span>
                    <Badge variant="outline" className={`text-xs ${p.status === "active" || p.is_active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                      {p.status || "active"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Manage Packages", href: "/admin/packages", icon: BookOpen },
            { label: "Gallery", href: "/admin/gallery", icon: Image },
            { label: "Broadcast", href: "/admin/broadcast", icon: MessageSquare },
            { label: "Settings", href: "/admin/settings", icon: Globe },
          ].map(a => (
            <Link key={a.href} href={a.href}>
              <div className="rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer flex items-center gap-3">
                <a.icon size={16} className="text-primary" />
                <span className="text-sm font-medium">{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
