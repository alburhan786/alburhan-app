import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Link } from "wouter";
import {
  Printer, CreditCard, Luggage, Stethoscope, Plane, Hotel, Bus,
  FileText, Star, Users, Hash, AlertCircle, DoorOpen
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

interface HajjGroup {
  id: string;
  name: string;
  season?: string;
  year?: number;
  departureDate?: string;
  returnDate?: string;
  status?: string;
  _count?: { pilgrims: number };
}

const PRINT_OPTIONS = [
  { label: "ID Cards (Basic)", icon: <CreditCard size={14} />, path: "id-cards", color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" },
  { label: "ID Cards (Pro)", icon: <Star size={14} />, path: "id-cards-pro", color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" },
  { label: "Luggage Labels", icon: <Luggage size={14} />, path: "luggage", color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" },
  { label: "Luggage Square", icon: <Luggage size={14} />, path: "luggage-square", color: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100" },
  { label: "Medical Cards", icon: <Stethoscope size={14} />, path: "medical", color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" },
  { label: "Hotel List", icon: <Hotel size={14} />, path: "hotel-list", color: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100" },
  { label: "Bus List", icon: <Bus size={14} />, path: "bus-list", color: "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" },
  { label: "Airline List", icon: <Plane size={14} />, path: "airline-list", color: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100" },
  { label: "Zamzam Labels", icon: <Hash size={14} />, path: "zamzam", color: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100" },
  { label: "Feedback Forms", icon: <FileText size={14} />, path: "feedback", color: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100" },
  { label: "Contract", icon: <FileText size={14} />, path: "contract", color: "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100" },
  { label: "Room Stickers", icon: <DoorOpen size={14} />, path: "room-stickers", color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
];

function statusColor(status?: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-700";
  if (status === "completed") return "bg-gray-100 text-gray-600";
  return "bg-amber-100 text-amber-700";
}

export default function PrintCenter() {
  const [groups, setGroups] = useState<HajjGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/groups`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setGroups(Array.isArray(data) ? data : (data.groups || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <AdminLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Printer className="w-7 h-7 text-[#0B3D2E]" />
          <h1 className="text-3xl font-serif font-bold text-foreground">Print Center</h1>
        </div>
        <p className="text-muted-foreground">All print options for every Hajj Group — ID cards, luggage labels, medical cards, lists and more.</p>
      </div>

      {/* Print Options Legend */}
      <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-5 mb-8">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Available Print Types</p>
        <div className="flex flex-wrap gap-2">
          {PRINT_OPTIONS.map(opt => (
            <div key={opt.path} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${opt.color}`}>
              {opt.icon} {opt.label}
            </div>
          ))}
        </div>
      </div>

      {/* Groups */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-border/50 p-16 text-center">
          <AlertCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <h3 className="font-bold text-gray-400 text-lg mb-2">No Hajj Groups Found</h3>
          <p className="text-sm text-gray-300 mb-6">Create a Hajj Group first to access print options.</p>
          <Link href="/admin/groups">
            <button className="px-6 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-semibold hover:bg-[#0d5038] transition">
              Go to Hajj Groups →
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const isOpen = expanded === group.id;
            return (
              <div key={group.id} className="bg-white rounded-2xl shadow-sm border border-border/50 overflow-hidden">
                {/* Group Header */}
                <button
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition text-left"
                  onClick={() => setExpanded(isOpen ? null : group.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#0B3D2E]/10 flex items-center justify-center">
                      <Users size={18} className="text-[#0B3D2E]" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base">{group.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        {group.season && <span className="text-xs text-muted-foreground">{group.season}</span>}
                        {group.year && <span className="text-xs text-muted-foreground">{group.year}</span>}
                        {group.departureDate && <span className="text-xs text-muted-foreground">Departs: {group.departureDate}</span>}
                        {group._count && <span className="text-xs font-semibold text-[#0B3D2E]">{group._count.pilgrims} Pilgrims</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {group.status && (
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor(group.status)}`}>{group.status}</span>
                    )}
                    <span className="text-muted-foreground text-lg">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {/* Print Buttons */}
                {isOpen && (
                  <div className="px-6 pb-5 border-t border-border/50 pt-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Select Print Type</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                      {PRINT_OPTIONS.map(opt => (
                        <Link key={opt.path} href={`/admin/groups/${group.id}/print/${opt.path}`}>
                          <button className={`w-full flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-semibold transition ${opt.color}`}>
                            <span className="text-base">{opt.icon}</span>
                            <span className="text-center leading-tight">{opt.label}</span>
                          </button>
                        </Link>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/admin/groups/${group.id}/pilgrims`}>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B3D2E] border border-[#0B3D2E]/30 rounded-lg hover:bg-[#0B3D2E]/5 transition">
                          <Users size={12} /> Manage Pilgrims
                        </button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
