import { useState, useEffect } from "react";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ExternalLink, FileText, Video, Link2, HelpCircle, Search, Globe } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "hajj_guide", label: "Hajj Guide" },
  { value: "umrah_guide", label: "Umrah Guide" },
  { value: "visa_info", label: "Visa Info" },
  { value: "packing", label: "Packing List" },
  { value: "health", label: "Health Tips" },
  { value: "emergency", label: "Emergency" },
  { value: "general", label: "General" },
];

const RESOURCE_ICONS: Record<string, React.ComponentType<any>> = {
  article: FileText,
  video:   Video,
  pdf:     FileText,
  link:    Link2,
  faq:     HelpCircle,
};

function ResourceCard({ resource }: { resource: any }) {
  const Icon = RESOURCE_ICONS[resource.resource_type] || FileText;
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-5 hover:shadow-md transition-shadow border border-slate-200">
      <div className="flex items-start gap-3">
        {resource.thumbnail_url ? (
          <img src={resource.thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <Icon size={22} className="text-emerald-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-slate-800 text-sm leading-snug">{resource.title}</h4>
            <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
              {resource.resource_type}
            </Badge>
          </div>
          {resource.description && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{resource.description}</p>
          )}

          {resource.content && (
            <div className="mt-2">
              <p className={`text-xs text-slate-600 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
                {resource.content}
              </p>
              {resource.content.length > 200 && (
                <button onClick={() => setExpanded(!expanded)}
                  className="text-xs text-emerald-600 hover:underline mt-1">
                  {expanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {resource.external_url && (
              <a href={resource.external_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                <ExternalLink size={11} />View resource
              </a>
            )}
            {resource.file_url && (
              <a href={resource.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                <FileText size={11} />Download
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("q", search);
    fetch(`${API}/api/customer/resources?${params}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) setResources(d.resources || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, search]);

  return (
    <CustomerPortalLayout title="Orientation Resources">
      <div className="space-y-5">
        {/* Search & filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput); }}
              placeholder="Search resources…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => setSearch(searchInput)} className="h-9 bg-emerald-600 hover:bg-emerald-700">
            <Search size={14} />
          </Button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                category === cat.value
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
              }`}>
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : resources.length === 0 ? (
          <Card className="p-10 text-center">
            <BookOpen size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500">No resources found.</p>
            {search && (
              <Button size="sm" variant="outline" onClick={() => { setSearch(""); setSearchInput(""); }}
                className="mt-3 h-8 text-xs">
                Clear search
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {resources.map(r => <ResourceCard key={r.id} resource={r} />)}
          </div>
        )}
      </div>
    </CustomerPortalLayout>
  );
}
