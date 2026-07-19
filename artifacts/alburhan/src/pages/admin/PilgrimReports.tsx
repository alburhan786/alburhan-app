import React, { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Plane, Hotel, Stamp, Users, RefreshCw } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

// Lightweight Excel export using xlsx (already installed)
async function downloadExcel(data: Record<string, unknown>[], filename: string, sheetName: string) {
  const xlsx = await import("xlsx");
  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  xlsx.writeFile(wb, filename);
}

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function flattenPilgrim(p: any) {
  return {
    "Serial No": p.serial_number || "",
    "Full Name": p.full_name || "",
    "Mobile (India)": p.mobile_india || "",
    "Mobile (Saudi)": p.mobile_saudi || "",
    "Passport No": p.passport_number || "",
    "Passport Expiry": p.passport_expiry_date ? new Date(p.passport_expiry_date).toLocaleDateString("en-IN") : "",
    "Nationality": p.nationality || "",
    "Date of Birth": p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString("en-IN") : "",
    "Gender": p.gender || "",
    "Blood Group": p.blood_group || "",
    "Visa Status": p.visa_status || "not_applied",
    "Visa No": p.visa_number || "",
    "Visa Type": p.visa_type || "",
    "Visa Applied Date": p.visa_applied_date ? new Date(p.visa_applied_date).toLocaleDateString("en-IN") : "",
    "Visa Received Date": p.visa_received_date ? new Date(p.visa_received_date).toLocaleDateString("en-IN") : "",
    "Medical Fitness": p.medical_fitness ? "Yes" : "No",
    "Medical Notes": p.medical_notes || "",
    "Emergency Contact": p.emergency_contact_name || "",
    "Emergency Mobile": p.emergency_contact_phone || "",
    "Mahram": p.mahram_name || "",
    "Mahram Relation": p.mahram_relation || "",
    "Luggage No": p.luggage_number || "",
    "Seat No": p.seat_number || "",
    "Group": p.group_name || "",
    "Booking No": p.booking_number || "",
    "Package": p.package_name || "",
  };
}

function flattenVisa(p: any) {
  return {
    "Serial No": p.serial_number || "",
    "Full Name": p.full_name || "",
    "Mobile": p.mobile_india || "",
    "Passport No": p.passport_number || "",
    "Passport Expiry": p.passport_expiry_date ? new Date(p.passport_expiry_date).toLocaleDateString("en-IN") : "",
    "Nationality": p.nationality || "",
    "DOB": p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString("en-IN") : "",
    "Gender": p.gender || "",
    "Visa Status": p.visa_status || "not_applied",
    "Applied Date": p.visa_applied_date ? new Date(p.visa_applied_date).toLocaleDateString("en-IN") : "",
    "Medical Fitness": p.medical_fitness ? "Yes" : "No",
    "Group": p.group_name || "",
    "Booking No": p.booking_number || "",
  };
}

function flattenHotel(h: any) {
  return {
    "Hotel Name": h.name || "",
    "City": h.city || "",
    "Stars": h.stars || "",
    "Total Rooms": h.total_rooms || "",
    "Occupied Rooms": h.occupied_rooms || 0,
    "Vacant Rooms": h.vacant_rooms ?? "",
    "Assigned Pilgrims": h.assigned_pilgrims || 0,
    "Check-In": h.check_in_date ? new Date(h.check_in_date).toLocaleDateString("en-IN") : "",
    "Check-Out": h.check_out_date ? new Date(h.check_out_date).toLocaleDateString("en-IN") : "",
  };
}

function flattenDeparture(p: any, f: any) {
  return {
    "Flight No": f.flight_number || "",
    "Airline": f.airline || "",
    "PNR": f.pnr || "",
    "From": f.departure_airport || "",
    "To": f.arrival_airport || "",
    "Departure Date": f.departure_date ? new Date(f.departure_date).toLocaleDateString("en-IN") : "",
    "Departure Time": f.departure_time || "",
    "Group": f.group_name || "",
    "Serial No": p.serial_number || "",
    "Pilgrim Name": p.full_name || "",
    "Passport No": p.passport_number || "",
    "Mobile": p.mobile_india || "",
    "Seat No": p.seat_number || "",
    "Visa No": p.visa_number || "",
  };
}

type Report = "pilgrims" | "visas" | "hotel-occupancy" | "departure";

const REPORTS = [
  {
    id: "pilgrims" as Report,
    label: "Pilgrim Master List",
    desc: "All pilgrims with passport, visa, medical & group info",
    icon: Users,
    color: "bg-teal-50 text-teal-700 border-teal-200",
    endpoint: "/api/admin/reports/pilgrims",
    sheet: "Pilgrims",
    flattenFn: (rows: any[]) => rows.map(flattenPilgrim),
  },
  {
    id: "visas" as Report,
    label: "Pending Visa Report",
    desc: "Pilgrims with visa not yet received",
    icon: Stamp,
    color: "bg-pink-50 text-pink-700 border-pink-200",
    endpoint: "/api/admin/reports/pending-visas",
    sheet: "Pending Visas",
    flattenFn: (rows: any[]) => rows.map(flattenVisa),
  },
  {
    id: "hotel-occupancy" as Report,
    label: "Hotel Occupancy Report",
    desc: "All hotels with room occupancy stats",
    icon: Hotel,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    endpoint: "/api/admin/reports/hotel-occupancy",
    sheet: "Hotel Occupancy",
    flattenFn: (rows: any[]) => rows.map(flattenHotel),
  },
  {
    id: "departure" as Report,
    label: "Departure List",
    desc: "All departing flights with assigned pilgrims",
    icon: Plane,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    endpoint: "/api/admin/reports/departure-list",
    sheet: "Departure List",
    flattenFn: (rows: any[]) => {
      const flat: any[] = [];
      for (const flight of rows) {
        if (flight.pilgrims?.length > 0) {
          for (const p of flight.pilgrims) flat.push(flattenDeparture(p, flight));
        } else {
          flat.push(flattenDeparture({}, flight));
        }
      }
      return flat;
    },
  },
];

export default function PilgrimReports() {
  const { toast } = useToast();
  const [loading, setLoading] = useState<Record<Report, boolean>>({} as any);
  const [preview, setPreview] = useState<{ id: Report; rows: any[] } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = async (report: typeof REPORTS[0]) => {
    setLoading(l => ({ ...l, [report.id]: true }));
    try {
      let url = `${BASE_API}${report.endpoint}`;
      if (report.id === "departure" && (dateFrom || dateTo)) {
        const params = new URLSearchParams();
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        url += "?" + params.toString();
      }
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load report");
      const raw = await r.json();
      const flat = report.flattenFn(raw);
      return flat;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setLoading(l => ({ ...l, [report.id]: false }));
    }
  };

  const handleExcel = async (report: typeof REPORTS[0]) => {
    const data = await fetchData(report);
    if (!data || data.length === 0) {
      toast({ title: "No data to export", description: "No records found for this report." });
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    await downloadExcel(data, `${report.id}-${date}.xlsx`, report.sheet);
    toast({ title: `✅ Excel downloaded: ${report.label}`, description: `${data.length} records` });
  };

  const handleCSV = async (report: typeof REPORTS[0]) => {
    const data = await fetchData(report);
    if (!data || data.length === 0) {
      toast({ title: "No data to export" });
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(data, `${report.id}-${date}.csv`);
    toast({ title: `✅ CSV downloaded: ${report.label}`, description: `${data.length} records` });
  };

  const handlePreview = async (report: typeof REPORTS[0]) => {
    const data = await fetchData(report);
    if (!data || data.length === 0) { toast({ title: "No data found" }); return; }
    setPreview({ id: report.id, rows: data.slice(0, 50) });
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pilgrim & Operations Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export Excel, CSV, or preview data for operations, visa management, hotels, and flights.
          </p>
        </div>

        {/* Departure date filter */}
        <div className="rounded-xl border bg-background p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Departure From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Departure To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-9 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">Date filter applies to Departure List only</p>
        </div>

        {/* Report cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          {REPORTS.map(report => (
            <div key={report.id} className={`rounded-2xl border p-5 space-y-4 ${report.color}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center border border-white shadow-sm">
                  <report.icon size={20} />
                </div>
                <div>
                  <p className="font-bold text-sm">{report.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{report.desc}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs bg-white/80 border-white hover:bg-white"
                  disabled={loading[report.id]}
                  onClick={() => handleExcel(report)}
                >
                  {loading[report.id] ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                  Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs bg-white/80 border-white hover:bg-white"
                  disabled={loading[report.id]}
                  onClick={() => handleCSV(report)}
                >
                  <FileText size={13} /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs bg-white/80 border-white hover:bg-white"
                  disabled={loading[report.id]}
                  onClick={() => handlePreview(report)}
                >
                  Preview (50 rows)
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Preview Table */}
        {preview && preview.rows.length > 0 && (
          <div className="rounded-2xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
              <h3 className="font-semibold text-sm">
                Preview — {REPORTS.find(r => r.id === preview.id)?.label} ({preview.rows.length} rows)
              </h3>
              <button onClick={() => setPreview(null)} className="text-xs text-muted-foreground hover:text-foreground">✕ Close</button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {Object.keys(preview.rows[0] || {}).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-r last:border-r-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      {Object.values(row).map((v: any, j) => (
                        <td key={j} className="px-3 py-2 border-r last:border-r-0 whitespace-nowrap max-w-[180px] truncate">
                          {String(v ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
