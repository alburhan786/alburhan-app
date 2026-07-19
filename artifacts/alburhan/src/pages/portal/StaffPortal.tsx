import React, { useState, useEffect } from "react";
import { IdCard, LogOut, RefreshCw, Phone, Calendar, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

const API = import.meta.env.VITE_API_URL || "";

export default function StaffPortal() {
  const { user, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/portal/staff`, { credentials: "include" });
      if (!r.ok) { setError("Failed to load staff data"); setLoading(false); return; }
      setData(await r.json());
    } catch {
      setError("Network error — please try again");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const m = data?.member || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center">
              <IdCard size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Al Burhan Tours & Travels</p>
              <p className="text-xs text-muted-foreground mt-0.5">Staff Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.mobile}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logout()}>
              <LogOut size={13} /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Staff Profile</h1>
          <Button onClick={load} disabled={loading} variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">Loading your profile…</div>
        ) : error ? (
          <div className="py-20 text-center text-red-500">{error}</div>
        ) : !m.id ? (
          <div className="py-20 text-center text-muted-foreground">Staff record not found</div>
        ) : (
          <>
            {/* Identity card */}
            <div className="rounded-2xl border bg-white p-6">
              <div className="flex items-start gap-4">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.full_name} className="w-16 h-16 rounded-xl object-cover border" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center border">
                    <User size={28} className="text-slate-400" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{m.full_name}</h2>
                  {m.designation && <p className="text-muted-foreground text-sm">{m.designation}</p>}
                  {m.department && <p className="text-muted-foreground text-sm">{m.department}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.staff_id && (
                      <Badge variant="outline" className="font-mono text-xs">{m.staff_id}</Badge>
                    )}
                    {m.employee_code && (
                      <Badge variant="outline" className="font-mono text-xs">{m.employee_code}</Badge>
                    )}
                    <Badge className={m.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                      {m.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="rounded-2xl border bg-white p-5 space-y-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Personal Details</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {m.mobile_india && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Mobile</p>
                      <p className="font-medium">{m.mobile_india}</p>
                    </div>
                  </div>
                )}
                {m.date_of_birth && (
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Date of Birth</p>
                      <p className="font-medium">{m.date_of_birth}</p>
                    </div>
                  </div>
                )}
                {m.blood_group && (
                  <div>
                    <p className="text-xs text-muted-foreground">Blood Group</p>
                    <p className="font-medium">{m.blood_group}</p>
                  </div>
                )}
                {m.joining_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Joining Date</p>
                    <p className="font-medium">{m.joining_date}</p>
                  </div>
                )}
                {m.valid_upto && (
                  <div>
                    <p className="text-xs text-muted-foreground">Valid Upto</p>
                    <p className="font-medium">{m.valid_upto}</p>
                  </div>
                )}
                {m.role && (
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Role</p>
                      <p className="font-medium capitalize">{m.role.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                )}
                {m.address && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="font-medium">{m.address}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Emergency contact */}
            {(m.emergency_contact || m.emergency_mobile) && (
              <div className="rounded-2xl border bg-white p-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Emergency Contact</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  {m.emergency_contact && (
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium">{m.emergency_contact}</p>
                    </div>
                  )}
                  {m.emergency_mobile && (
                    <div>
                      <p className="text-xs text-muted-foreground">Mobile</p>
                      <p className="font-medium">{m.emergency_mobile}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
