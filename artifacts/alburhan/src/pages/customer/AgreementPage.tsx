import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Shield, CheckCircle, Clock, AlertCircle, FileText, Loader2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

// The 9 CONSENT_CATEGORIES that the backend requires (must match agreements.ts CONSENT_CATEGORIES)
const CONSENT_IDS = [
  "hajj_package_terms", "payment_policy", "cancellation_policy",
  "document_responsibility", "health_fitness", "conduct_compliance",
  "data_processing", "force_majeure", "final_authority",
];

const CONSENT_LABELS: Record<string, string> = {
  hajj_package_terms:  "I agree to the Hajj package terms and conditions",
  payment_policy:      "I agree to the payment policy",
  cancellation_policy: "I agree to the cancellation and refund policy",
  document_responsibility: "I accept responsibility for my travel documents",
  health_fitness:      "I confirm I am medically fit to perform Hajj",
  conduct_compliance:  "I agree to conduct and compliance guidelines",
  data_processing:     "I consent to data processing for pilgrimage purposes",
  force_majeure:       "I accept force majeure and extraordinary event terms",
  final_authority:     "I acknowledge Al Burhan's final authority on itinerary changes",
};

type Step = "view" | "otp-sent" | "signed" | "already-signed";

export default function AgreementPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/agreement");
  const bookingNumber = params?.bookingNumber;
  const [agreement, setAgreement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("view");
  const [otp, setOtp] = useState("");
  const [consents, setConsents] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!bookingNumber) return;
    fetch(`${API}/api/agreements/my`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.agreements) {
          const match = d.agreements.find((a: any) => a.booking_number === bookingNumber);
          setAgreement(match || null);
          if (match?.status === "signed") setStep("signed");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingNumber]);

  async function requestOtp() {
    if (!agreement?.id) return;
    setWorking(true);
    try {
      const r = await fetch(`${API}/api/customer/agreements/${agreement.id}/request-otp`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setStep("otp-sent");
        toast({ title: "OTP sent", description: "Check your registered mobile number" });
      } else {
        toast({ title: "Failed to send OTP", description: d.error || "Please try again", variant: "destructive" });
      }
    } finally { setWorking(false); }
  }

  async function submitSign() {
    if (!agreement?.id || !otp.trim()) return;
    const allConsented = CONSENT_IDS.every(id => consents[id]);
    if (!allConsented) {
      toast({ title: "Please accept all terms", variant: "destructive" });
      return;
    }
    const termsObj: Record<string, boolean> = {};
    CONSENT_IDS.forEach(id => { termsObj[id] = true; });

    setWorking(true);
    try {
      const r = await fetch(`${API}/api/customer/agreements/${agreement.id}/sign`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim(), termsAccepted: termsObj }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setAgreement((prev: any) => ({ ...prev, status: "signed", signed_at: new Date().toISOString() }));
        setStep("signed");
        toast({ title: "Agreement signed", description: "Your signed copy has been saved." });
      } else {
        toast({ title: "Signing failed", description: d.error || "Please try again", variant: "destructive" });
      }
    } finally { setWorking(false); }
  }

  function statusColor(s: string) {
    if (s === "signed") return "bg-green-100 text-green-700";
    if (s === "sent" || s === "pending" || s === "pending_signature") return "bg-amber-100 text-amber-700";
    if (s === "expired") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-600";
  }

  function statusIcon(s: string) {
    if (s === "signed") return <CheckCircle size={20} className="text-green-500" />;
    if (s === "sent" || s === "pending" || s === "pending_signature") return <Clock size={20} className="text-amber-500" />;
    return <AlertCircle size={20} className="text-slate-400" />;
  }

  const isUnsigned = agreement && agreement.status !== "signed" && agreement.status !== "expired";

  return (
    <CustomerPortalLayout title="Agreement" bookingNumber={bookingNumber}>
      <div className="space-y-5">
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : !agreement ? (
          <Card className="p-8 text-center">
            <FileText size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-600 font-medium">No Agreement Yet</p>
            <p className="text-sm text-slate-400 mt-1">Your agreement will appear here once it's generated.</p>
          </Card>
        ) : (
          <>
            {/* Agreement header */}
            <Card className="p-6">
              <div className="flex items-center gap-4 mb-5">
                {statusIcon(agreement.status)}
                <div>
                  <p className="font-semibold text-slate-800">Pilgrimage Agreement</p>
                  <Badge className={`${statusColor(agreement.status)} capitalize text-xs mt-1`}>
                    {agreement.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <p className="text-xs text-slate-400">Agreement ID</p>
                  <p className="text-sm font-medium text-slate-800 font-mono">{agreement.id?.slice(0,8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Generated</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(agreement.created_at)}</p>
                </div>
                {agreement.signed_at && (
                  <div>
                    <p className="text-xs text-slate-400">Signed On</p>
                    <p className="text-sm font-medium text-green-700">{formatDate(agreement.signed_at)}</p>
                  </div>
                )}
                {agreement.package_name && (
                  <div>
                    <p className="text-xs text-slate-400">Package</p>
                    <p className="text-sm font-medium text-slate-800">{agreement.package_name}</p>
                  </div>
                )}
              </div>

              {/* Signed state */}
              {step === "signed" && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-center gap-2">
                  <CheckCircle size={15} className="text-green-500" />
                  <p className="text-sm text-green-700">
                    Agreement signed {agreement.signed_at ? `on ${formatDate(agreement.signed_at)}` : ""}. A copy has been saved for your records.
                  </p>
                </div>
              )}

              {/* Expired state */}
              {agreement.status === "expired" && step !== "signed" && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">This agreement has expired. Please contact us to generate a new one.</p>
                </div>
              )}

              {/* Unsigned — initial view */}
              {isUnsigned && step === "view" && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-700 font-medium">Action Required</p>
                    <p className="text-xs text-amber-600 mt-0.5">Please sign your agreement to complete your booking.</p>
                  </div>
                  <Button onClick={requestOtp} disabled={working}
                    className="bg-emerald-600 hover:bg-emerald-700 h-9 text-sm w-full">
                    {working ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Shield size={15} className="mr-1.5" />}
                    Sign Agreement via OTP
                  </Button>
                </div>
              )}

              {/* OTP + consent signing form */}
              {isUnsigned && step === "otp-sent" && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm text-blue-700 font-medium">OTP Sent</p>
                    <p className="text-xs text-blue-600 mt-0.5">An OTP has been sent to your registered mobile. Enter it below to sign.</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Enter OTP</label>
                    <Input
                      type="text" inputMode="numeric" maxLength={6}
                      placeholder="6-digit OTP"
                      value={otp} onChange={e => setOtp(e.target.value)}
                      className="text-center text-lg font-mono tracking-widest h-11"
                    />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-2">Please accept all terms to proceed:</p>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {CONSENT_IDS.map(id => (
                        <label key={id} className="flex items-start gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={!!consents[id]}
                            onChange={e => setConsents(prev => ({ ...prev, [id]: e.target.checked }))}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="text-xs text-slate-600 group-hover:text-slate-800 leading-relaxed">
                            {CONSENT_LABELS[id] ?? id}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setStep("view")} className="flex-1">
                      Back
                    </Button>
                    <Button onClick={submitSign} disabled={working || !otp.trim()}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-sm h-9">
                      {working ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Shield size={15} className="mr-1.5" />}
                      Sign Agreement
                    </Button>
                  </div>

                  <button
                    onClick={requestOtp}
                    disabled={working}
                    className="text-xs text-slate-400 hover:text-emerald-600 w-full text-center mt-1 transition-colors">
                    Resend OTP
                  </button>
                </div>
              )}
            </Card>

            {step === "signed" && (
              <Card className="p-4 bg-slate-50 border-dashed">
                <p className="text-xs text-slate-400 text-center">
                  A digitally signed PDF copy of your agreement has been saved by Al Burhan Tours & Travels.
                  Contact us if you need a copy emailed to you.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </CustomerPortalLayout>
  );
}
