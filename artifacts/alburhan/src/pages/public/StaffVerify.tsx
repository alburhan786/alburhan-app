import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, Shield } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";

interface StaffInfo {
  id: string;
  staffId?: string;
  fullName: string;
  fatherName?: string;
  designation?: string;
  department?: string;
  role: string;
  companyId: string;
  groupId?: string;
  bloodGroup?: string;
  validUpto?: string;
  status: string;
  mobileIndia?: string;
  photoUrl?: string;
}

const ROLE_LABELS: Record<string, string> = {
  airport_staff: "Airport Staff",
  catering_staff: "Catering Staff",
};

export default function StaffVerify() {
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const staffId = params.get("id") || "";
    if (!staffId) {
      setError("No staff ID provided. Please scan a valid QR code.");
      setLoading(false);
      return;
    }
    fetch(`${API}/api/staff/verify?id=${encodeURIComponent(staffId)}`)
      .then(r => { if (!r.ok) throw new Error("Staff member not found"); return r.json(); })
      .then(data => { setStaff(data); setLoading(false); })
      .catch(err => { setError(err.message || "Verification failed"); setLoading(false); });
  }, []);

  const isExpired = staff?.validUpto
    ? (() => {
        const d = new Date(staff.validUpto);
        return !isNaN(d.getTime()) && d < new Date();
      })()
    : false;

  const isValid = staff?.status === "active" && !isExpired;

  return (
    <MainLayout>
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-block w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Verifying staff ID card...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
              <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-red-800 mb-2">Verification Failed</h2>
              <p className="text-red-600">{error}</p>
              <p className="text-sm text-red-500 mt-3">This QR code may be invalid or the staff record no longer exists.</p>
            </div>
          ) : staff ? (
            <div className={`rounded-2xl border-2 overflow-hidden shadow-lg ${
              isValid ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
            }`}>
              {/* Status banner */}
              <div className={`p-4 flex items-center gap-3 ${isValid ? "bg-green-600" : "bg-red-600"}`}>
                {isValid
                  ? <CheckCircle className="w-8 h-8 text-white shrink-0" />
                  : <XCircle className="w-8 h-8 text-white shrink-0" />
                }
                <div>
                  <div className="text-white font-bold text-lg">
                    {isValid ? "Valid ID Card" : isExpired ? "Card Expired" : "Card Inactive"}
                  </div>
                  <div className="text-white/80 text-sm">
                    {isValid
                      ? "This employee is currently authorized."
                      : isExpired
                        ? "This ID card has passed its validity date."
                        : "This employee's card has been deactivated."
                    }
                  </div>
                </div>
              </div>

              {/* Staff info */}
              <div className="p-5">
                <div className="flex items-start gap-4 mb-5">
                  {staff.photoUrl ? (
                    <img
                      src={`${API}${staff.photoUrl}`}
                      alt={staff.fullName}
                      className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-md shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-muted border-2 border-white shadow-md flex items-center justify-center text-muted-foreground shrink-0">
                      <Shield size={32} />
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{staff.fullName}</h2>
                    {staff.fatherName && <p className="text-sm text-muted-foreground">S/o {staff.fatherName}</p>}
                    {staff.designation && <p className="text-sm font-semibold text-primary">{staff.designation}</p>}
                    {staff.department && <p className="text-sm text-muted-foreground">{staff.department}</p>}
                    <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      staff.role === "catering_staff" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {ROLE_LABELS[staff.role] || staff.role}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {staff.staffId && (
                    <div className="flex justify-between py-1.5 border-b border-black/5">
                      <span className="text-muted-foreground font-medium">Employee ID</span>
                      <span className="font-bold font-mono">{staff.staffId}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 border-b border-black/5">
                    <span className="text-muted-foreground font-medium">Company</span>
                    <span className="font-semibold">{getCompanyById(staff.companyId).name}</span>
                  </div>
                  {staff.bloodGroup && (
                    <div className="flex justify-between py-1.5 border-b border-black/5">
                      <span className="text-muted-foreground font-medium">Blood Group</span>
                      <span className="font-bold text-red-600">{staff.bloodGroup}</span>
                    </div>
                  )}
                  {staff.validUpto && (
                    <div className="flex justify-between py-1.5 border-b border-black/5">
                      <span className="text-muted-foreground font-medium">Valid Upto</span>
                      <span className={`font-bold ${isExpired ? "text-red-600" : "text-green-600"}`}>{staff.validUpto}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground font-medium">Status</span>
                    <span className={`font-bold ${staff.status === "active" ? "text-green-600" : "text-red-600"}`}>
                      {staff.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                {isExpired && (
                  <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">This card is expired. Please contact the company to renew.</p>
                  </div>
                )}
              </div>

              <div className="bg-white/60 px-5 py-3 text-center text-xs text-muted-foreground border-t">
                Verified by Al Burhan Tours & Travels • {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
}
