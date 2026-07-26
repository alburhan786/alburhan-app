import React, { useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { useListBookings, useListDocuments, useDeleteDocument } from "@workspace/api-client-react";
import { usePayment } from "@/hooks/use-payment";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CreditCard, FileText, Download, Clock, Upload, Trash2, CheckCircle, AlertCircle, X, Eye, ShieldAlert, IndianRupee, Plane, Stamp, Hotel, Bus, Printer, Share2, Copy, Bell, BellRing, CheckCheck, Megaphone, ClipboardList, MessageSquare, Send, User, XCircle, Building2, Banknote, RefreshCcw, Syringe, MapPin, Bed, ChevronRight, AlertTriangle, PhoneCall, Activity, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useQueryClient } from "@tanstack/react-query";

const DOC_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "medical_certificate", label: "Medical Fitness Certificate" },
  { value: "passport_photo", label: "Passport Size Photo" },
  { value: "other", label: "Other Document" },
];

const MANDATORY_DOCS = [
  { value: "passport_photo", label: "Passport Size Photo" },
  { value: "passport", label: "Passport Copy" },
  { value: "pan_card", label: "PAN Card" },
  { value: "aadhaar", label: "Aadhaar Card" },
];

const BASE_API = import.meta.env.VITE_API_URL || "";

// ── Weather + Currency Widget ───────────────────────────────────────────────────
function WeatherCurrencyWidget() {
  const [weather, setWeather] = useState<{ temp: number; code: number; wind: number } | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    // Makkah coordinates: lat=21.3891, lon=39.8579
    fetch("https://api.open-meteo.com/v1/forecast?latitude=21.3891&longitude=39.8579&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.current) {
          setWeather({ temp: Math.round(d.current.temperature_2m), code: d.current.weather_code, wind: Math.round(d.current.wind_speed_10m) });
        }
      })
      .catch(() => {});

    // SAR to INR via frankfurter.app (free, no key)
    fetch("https://api.frankfurter.app/latest?from=SAR&to=INR")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rates?.INR) setRate(Number(d.rates.INR.toFixed(2))); })
      .catch(() => {});
  }, []);

  function weatherEmoji(code: number) {
    if (code === 0) return "☀️";
    if (code <= 3) return "🌤️";
    if (code <= 49) return "🌫️";
    if (code <= 69) return "🌧️";
    if (code <= 79) return "🌨️";
    if (code <= 99) return "⛈️";
    return "🌡️";
  }

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-background overflow-hidden">
      {/* Makkah Weather */}
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">🕌 Makkah Weather</p>
        {weather ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{weatherEmoji(weather.code)}</span>
              <div>
                <p className="text-xl font-bold font-mono leading-none">{weather.temp}°C</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Wind {weather.wind} km/h</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Saudi Arabia</p>
              <p className="text-xs font-semibold text-sky-700">Live</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </div>

      {/* SAR → INR Rate */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">💱 Currency Rate</p>
        {rate ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">1 SAR = <span className="text-primary font-mono">₹{rate}</span></p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Saudi Riyal → Indian Rupee</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Via Frankfurter</p>
              <p className="text-xs font-semibold text-emerald-700">Live</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}
      </div>
    </div>
  );
}

// ── Departure Countdown Card ────────────────────────────────────────────────────
function DepartureCountdownCard({ departureDate, bookingId }: { departureDate?: string; bookingId: string }) {
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  const [flightDate, setFlightDate] = useState<Date | null>(null);
  const [prayers, setPrayers] = useState<any | null>(null);
  const [loadingPrayers, setLoadingPrayers] = useState(false);

  // Resolve actual flight departure from journey API, fallback to booking date
  useEffect(() => {
    if (!bookingId) return;
    fetch(`${BASE_API}/api/customer/journey/${bookingId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const fl = d?.flights?.[0];
        if (fl?.departure_date) {
          const dt = new Date(fl.departure_date);
          if (fl.departure_time) {
            const [h, m] = fl.departure_time.split(":");
            dt.setHours(parseInt(h || "0"), parseInt(m || "0"), 0, 0);
          }
          setFlightDate(dt);
        } else if (departureDate) {
          setFlightDate(new Date(departureDate));
        }
      })
      .catch(() => { if (departureDate) setFlightDate(new Date(departureDate)); });
  }, [bookingId, departureDate]);

  // Live countdown ticker
  useEffect(() => {
    if (!flightDate) return;
    const tick = () => {
      const diff = flightDate.getTime() - Date.now();
      if (diff <= 0) { setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [flightDate]);

  // Prayer timings (Makkah)
  useEffect(() => {
    setLoadingPrayers(true);
    fetch("https://api.aladhan.com/v1/timingsByCity?city=Makkah&country=SA&method=4", { mode: "cors" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.data?.timings) setPrayers(d.data.timings); })
      .catch(() => {})
      .finally(() => setLoadingPrayers(false));
  }, []);

  if (!flightDate || !countdown) return null;
  const departed = countdown.days === 0 && countdown.hours === 0 && countdown.minutes === 0;

  const PRAYER_KEYS = [
    { key: "Fajr", label: "Fajr" },
    { key: "Dhuhr", label: "Dhuhr" },
    { key: "Asr", label: "Asr" },
    { key: "Maghrib", label: "Maghrib" },
    { key: "Isha", label: "Isha" },
  ];

  // Detect next prayer
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let nextPrayer: string | null = null;
  if (prayers) {
    for (const p of PRAYER_KEYS) {
      const [h, m] = (prayers[p.key] || "").split(":").map(Number);
      if (!isNaN(h) && h * 60 + m > nowMins) { nextPrayer = p.key; break; }
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-background overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="text-xl">✈️</span>
          <p className="font-bold text-sm">
            {departed ? "Flight Departed!" : "Departure Countdown"}
          </p>
        </div>
        {/* Countdown tiles */}
        {!departed ? (
          <div className="grid grid-cols-4 gap-2">
            {[
              { val: countdown.days, label: "Days" },
              { val: countdown.hours, label: "Hours" },
              { val: countdown.minutes, label: "Mins" },
              { val: countdown.seconds, label: "Secs" },
            ].map(t => (
              <div key={t.label} className="rounded-xl bg-primary/10 border border-primary/20 py-2 text-center">
                <p className="text-2xl font-bold font-mono text-primary leading-none">
                  {String(t.val).padStart(2, "0")}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{t.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-emerald-700 font-semibold text-sm">Bon Voyage! 🌙</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {flightDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Prayer Timings (Makkah) */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm">🕌</span>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Prayer Timings — Makkah</p>
        </div>
        {loadingPrayers ? (
          <p className="text-xs text-muted-foreground">Loading prayer times…</p>
        ) : prayers ? (
          <div className="grid grid-cols-5 gap-1.5">
            {PRAYER_KEYS.map(p => (
              <div
                key={p.key}
                className={`rounded-lg p-1.5 text-center border transition-all ${
                  nextPrayer === p.key
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 border-border/50"
                }`}
              >
                <p className={`text-[10px] font-semibold ${nextPrayer === p.key ? "text-primary-foreground" : "text-muted-foreground"}`}>
                  {p.label}
                </p>
                <p className={`text-[11px] font-bold font-mono mt-0.5 ${nextPrayer === p.key ? "text-primary-foreground" : "text-foreground"}`}>
                  {prayers[p.key] || "--"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Prayer times unavailable</p>
        )}
      </div>
    </div>
  );
}

// ── Journey Status Card (Visa / Flight / Hotel) ────────────────────────────────
function JourneyStatusCard({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    fetch(`${BASE_API}/api/customer/journey/${bookingId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookingId]);

  if (loading || !data || !data.hasPilgrimData) return null;

  const pilgrim = data.pilgrims?.[0];
  const flight = data.flights?.[0];
  const hotel = data.hotels?.[0];
  const visaStatus = pilgrim?.visaStatus || "not_applied";

  const VISA_COLOR: Record<string, string> = {
    not_applied: "bg-gray-100 text-gray-600",
    applied: "bg-blue-100 text-blue-800",
    received: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-700",
    processing: "bg-amber-100 text-amber-800",
  };
  const VISA_LABEL: Record<string, string> = {
    not_applied: "Not Applied",
    applied: "Visa Applied",
    received: "Visa Received ✓",
    rejected: "Visa Rejected",
    processing: "Processing",
  };

  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2.5 font-semibold text-sm">
          <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-lg">✈️</span>
          Journey Status
        </span>
        <div className="flex items-center gap-2">
          {pilgrim && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${VISA_COLOR[visaStatus] || VISA_COLOR.not_applied}`}>
              {VISA_LABEL[visaStatus] || visaStatus}
            </span>
          )}
          <ChevronRight size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Visa */}
          {pilgrim && (
            <div className="rounded-xl bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                <Stamp size={13} /> Visa
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{pilgrim.pilgrimName}</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${VISA_COLOR[visaStatus] || VISA_COLOR.not_applied}`}>
                  {VISA_LABEL[visaStatus] || visaStatus}
                </span>
              </div>
              {pilgrim.visaNumber && (
                <p className="text-xs text-muted-foreground">Visa No: <span className="font-mono text-foreground">{pilgrim.visaNumber}</span></p>
              )}
              {pilgrim.visaType && (
                <p className="text-xs text-muted-foreground">Type: {pilgrim.visaType}</p>
              )}
              {pilgrim.visaAppliedDate && (
                <p className="text-xs text-muted-foreground">Applied: {new Date(pilgrim.visaAppliedDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}</p>
              )}
              {pilgrim.visaReceivedDate && (
                <p className="text-xs text-emerald-700 font-medium">Received: {new Date(pilgrim.visaReceivedDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}</p>
              )}
              {data.pilgrims.length > 1 && (
                <p className="text-[11px] text-primary mt-1">+{data.pilgrims.length - 1} more pilgrim(s)</p>
              )}
            </div>
          )}

          {/* Flight */}
          {flight ? (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs text-blue-700 uppercase tracking-wide">
                <Plane size={13} /> Flight — {flight.flight_type === "departure" ? "Departure" : flight.flight_type === "return" ? "Return" : flight.flight_type || "Flight"}
              </div>
              <p className="text-sm font-medium">{flight.airline} {flight.flight_number}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{flight.departure_airport}</span>
                <span>→</span>
                <span>{flight.arrival_airport}</span>
              </div>
              {flight.departure_date && (
                <p className="text-xs text-blue-700 font-medium">
                  {new Date(flight.departure_date).toLocaleDateString("en-IN", { weekday:"short", day:"2-digit", month:"short", year:"numeric" })}
                  {flight.departure_time ? ` at ${flight.departure_time}` : ""}
                </p>
              )}
              {flight.pnr && (
                <p className="text-xs text-muted-foreground">PNR: <span className="font-mono text-foreground font-semibold">{flight.pnr}</span></p>
              )}
              {data.flights.length > 1 && (
                <p className="text-[11px] text-blue-600 mt-1">+{data.flights.length - 1} more flight(s)</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              <Plane size={16} className="mx-auto mb-1 opacity-40" />
              Flight not yet assigned
            </div>
          )}

          {/* Hotel */}
          {hotel ? (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-xs text-amber-700 uppercase tracking-wide">
                <Hotel size={13} /> Hotel — {hotel.hotelCity}
              </div>
              <p className="text-sm font-medium">{hotel.hotelName}</p>
              {hotel.hotelAddress && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <MapPin size={11} className="mt-0.5 shrink-0" />
                  {hotel.hotelAddress}
                </p>
              )}
              {hotel.roomNumber && (
                <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                  <Bed size={12} /> Room {hotel.roomNumber}{hotel.floor ? `, Floor ${hotel.floor}` : ""}
                </p>
              )}
              {(hotel.checkInDate || hotel.checkOutDate) && (
                <p className="text-xs text-muted-foreground">
                  {hotel.checkInDate ? `Check-in: ${new Date(hotel.checkInDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}` : ""}
                  {hotel.checkInDate && hotel.checkOutDate ? " · " : ""}
                  {hotel.checkOutDate ? `Check-out: ${new Date(hotel.checkOutDate).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}` : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              <Hotel size={16} className="mx-auto mb-1 opacity-40" />
              Hotel not yet assigned
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocWarningBadge({ bookingId }: { bookingId: string }) {
  const { data: docs } = useListDocuments(bookingId);
  const uploadedTypes = (docs || []).map((d: any) => d.documentType);
  const uploadedCount = MANDATORY_DOCS.filter(d => uploadedTypes.includes(d.value)).length;
  if (uploadedCount === MANDATORY_DOCS.length) return null;
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-2 py-0.5 animate-pulse">
      <AlertCircle size={12} className="mr-1" /> {MANDATORY_DOCS.length - uploadedCount} doc(s) missing
    </Badge>
  );
}

// ── My Agreements Section ──────────────────────────────────────────────────────
function MyAgreementsSection({
  agreements,
  onDownload,
  onRefresh,
}: {
  agreements: any[];
  onDownload: (id: string, num: string) => void;
  onRefresh: () => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const BASE = import.meta.env.BASE_URL || "/";

  const handleShare = (ag: any) => {
    const verifyToken = ag.verification_token || ag.agreement_number;
    const url = `https://alburhantravels.online/verify-agreement/${verifyToken}`;
    if (navigator.share) {
      navigator.share({ title: `Hajj Agreement ${ag.agreement_number}`, text: `Al Burhan Tours & Travels — ${ag.agreement_number}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedId(ag.id);
        setTimeout(() => setCopiedId(null), 2500);
      }).catch(() => {});
    }
  };

  const agStatusColor = (s: string) => {
    if (s === "signed")            return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (s === "pending_signature") return "bg-amber-100 text-amber-800 border-amber-300";
    if (s === "expired")           return "bg-gray-100 text-gray-600 border-gray-300";
    if (s === "rejected")          return "bg-red-100 text-red-700 border-red-300";
    return "bg-blue-100 text-blue-800 border-blue-300";
  };
  const agStatusLabel = (s: string) => {
    if (s === "signed")            return "✅ Signed";
    if (s === "pending_signature") return "⏳ Pending Signature";
    if (s === "expired")           return "⌛ Expired";
    if (s === "rejected")          return "❌ Rejected";
    return s;
  };

  if (agreements.length === 0) return null;

  const pending = agreements.filter(a => a.status === "pending_signature");

  return (
    <div className="space-y-4">
      {/* Section heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-serif font-bold text-foreground">📄 My Agreements</h2>
          {pending.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
              {pending.length} Action Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-muted-foreground">
            {agreements.length} agreement{agreements.length !== 1 ? "s" : ""}
          </Badge>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-accent"
          >
            <RefreshCcw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Pending alert banner */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {pending.length} agreement{pending.length > 1 ? "s" : ""} awaiting your signature
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Please review and digitally sign your Hajj Agreement to confirm your booking. Signing requires OTP verification on your registered mobile.
            </p>
          </div>
        </div>
      )}

      {/* Agreement cards */}
      <div className="space-y-4">
        {agreements.map((ag: any) => {
          const isPending = ag.status === "pending_signature";
          const isSigned  = ag.status === "signed";
          const borderClr = isPending ? "#fcd34d" : isSigned ? "#6ee7b7" : "#e5e7eb";
          const bgGrad    = isPending
            ? "linear-gradient(135deg,#fffbeb 0%,#fef9ec 100%)"
            : isSigned
            ? "linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%)"
            : "linear-gradient(135deg,#f9fafb 0%,#f3f4f6 100%)";
          const accentClr = isPending ? "#92400e" : isSigned ? "#065f46" : "#374151";

          return (
            <Card key={ag.id} className="overflow-hidden rounded-2xl shadow-sm" style={{ border: `1.5px solid ${borderClr}` }}>
              {/* Card header */}
              <div
                className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3"
                style={{ background: isPending ? "rgba(251,191,36,0.1)" : isSigned ? "rgba(16,185,129,0.1)" : "rgba(0,0,0,0.03)", borderColor: borderClr }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{isSigned ? "✅" : isPending ? "📜" : "📄"}</span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Agreement ID</p>
                    <p className="font-mono font-bold text-base" style={{ color: accentClr }}>{ag.agreement_number}</p>
                  </div>
                </div>
                <Badge className={`text-xs font-bold px-3 py-1 border ${agStatusColor(ag.status)} ${isPending ? "animate-pulse" : ""}`}>
                  {agStatusLabel(ag.status)}
                </Badge>
              </div>

              {/* Details + buttons */}
              <div className="p-5" style={{ background: bgGrad }}>
                {/* Info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mb-4">
                  {ag.booking_number && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Booking No.</p>
                      <p className="font-mono font-semibold text-sm">#{ag.booking_number}</p>
                    </div>
                  )}
                  {ag.package_name && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Package</p>
                      <p className="font-semibold text-sm leading-tight">{ag.package_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Generated On</p>
                    <p className="font-semibold text-sm">{new Date(ag.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
                  </div>
                  {isSigned && ag.signed_at && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Signed On</p>
                      <p className="font-semibold text-sm text-emerald-700">
                        {new Date(ag.signed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Verification</p>
                    <p className={`font-semibold text-sm ${isSigned ? "text-emerald-700" : "text-amber-700"}`}>
                      {isSigned ? "✅ Verified" : "⏳ Pending"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Status</p>
                    <p className={`font-semibold text-sm ${isSigned ? "text-emerald-700" : isPending ? "text-amber-700" : "text-gray-600"}`}>
                      {agStatusLabel(ag.status)}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  {isPending ? (
                    <Button
                      size="sm"
                      className="text-white font-semibold text-xs shadow-sm"
                      style={{ background: "#d97706" }}
                      onClick={() => window.open(BASE + "agreement/" + ag.id + "/sign", "_blank")}
                    >
                      ✍ Sign Agreement
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="text-white font-semibold text-xs"
                      style={{ background: "#059669" }}
                      onClick={() => window.open(BASE + "agreement/" + ag.id + "/sign", "_blank")}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> View Signed Agreement
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold text-xs"
                    style={{ borderColor: isPending ? "#d97706" : "#059669", color: isPending ? "#92400e" : "#065f46" }}
                    onClick={() => onDownload(ag.id, ag.agreement_number)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                    onClick={() => window.open(BASE + "verify-agreement/" + (ag.verification_token || ag.agreement_number), "_blank")}
                  >
                    🔍 Verify Agreement
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                    onClick={() => {
                      const tok = ag.verification_token || ag.agreement_number;
                      const verifyUrl = `https://alburhantravels.online/verify-agreement/${tok}`;
                      window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(verifyUrl)}`, "_blank");
                    }}
                  >
                    📷 QR Code
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                    onClick={() => handleShare(ag)}
                  >
                    {copiedId === ag.id
                      ? <><CheckCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Copied!</>
                      : <><Share2 className="w-3.5 h-3.5 mr-1.5" /> Share</>
                    }
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MandatoryDocumentsCard({ bookingId, onOpenUpload }: { bookingId: string; onOpenUpload: () => void }) {
  const { data: docs } = useListDocuments(bookingId);
  const uploadedTypes = (docs || []).map((d: any) => d.documentType);
  const uploadedCount = MANDATORY_DOCS.filter(d => uploadedTypes.includes(d.value)).length;
  const allDone = uploadedCount === MANDATORY_DOCS.length;
  const pct = Math.round((uploadedCount / MANDATORY_DOCS.length) * 100);

  return (
    <Card className={`overflow-hidden rounded-2xl shadow-md border-2 ${allDone ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/50"}`}>
      <div className={`px-5 py-4 flex items-center gap-3 ${allDone ? "bg-emerald-100" : "bg-amber-100"}`}>
        {allDone
          ? <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
          : <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />}
        <div className="flex-1">
          <h4 className="font-bold text-sm">{allDone ? "All Documents Submitted" : "Required Documents — Please Upload"}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{uploadedCount} of {MANDATORY_DOCS.length} documents uploaded</p>
        </div>
      </div>
      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="px-5 py-3 space-y-2">
        {MANDATORY_DOCS.map(doc => {
          const uploaded = uploadedTypes.includes(doc.value);
          return (
            <div key={doc.value} className="flex items-center gap-2 text-sm">
              {uploaded
                ? <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                : <X size={16} className="text-red-400 shrink-0" />}
              <span className={uploaded ? "text-foreground/70 line-through" : "text-foreground font-medium"}>{doc.label}</span>
              {uploaded && <Badge className="ml-auto bg-emerald-100 text-emerald-800 text-[10px] px-1.5">Done</Badge>}
            </div>
          );
        })}
      </div>
      {!allDone && (
        <div className="px-5 pb-4">
          <Button onClick={onOpenUpload} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
            <Upload className="w-4 h-4 mr-2" /> Upload Missing Documents
          </Button>
        </div>
      )}
    </Card>
  );
}


function TravelDetailsCard({ bookingId, initialStatus }: { bookingId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [showForm, setShowForm] = useState(initialStatus === "not_submitted");
  const [loadingProfile, setLoadingProfile] = useState(initialStatus === "not_submitted");
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", dateOfBirth: "", gender: "",
    address: "", passportNumber: "", passportIssueDate: "", passportExpiryDate: "", passportPlaceOfIssue: "",
  });
  const { toast } = useToast();

  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const res = await fetch(`${BASE_API}/api/bookings/${bookingId}/traveller-details`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.travellerDetailsStatus ?? status);
        if (data.profile) {
          setForm({
            name: data.profile.name || "",
            dateOfBirth: data.profile.dateOfBirth || "",
            gender: data.profile.gender || "",
            address: data.profile.address || "",
            passportNumber: data.profile.passportNumber || "",
            passportIssueDate: data.profile.passportIssueDate || "",
            passportExpiryDate: data.profile.passportExpiryDate || "",
            passportPlaceOfIssue: data.profile.passportPlaceOfIssue || "",
          });
          setExistingPhotoUrl(data.profile.photoUrl || null);
        }
      }
    } catch {}
    setLoadingProfile(false);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleOpenForm = () => {
    setShowForm(true);
    loadProfile();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Full name is required", variant: "destructive" }); return;
    }
    if (!form.passportNumber.trim()) {
      toast({ title: "Passport number is required", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile) fd.append("photo", photoFile);

      const res = await fetch(`${BASE_API}/api/bookings/${bookingId}/traveller-details`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Submission failed");
      }
      const data = await res.json();
      if (data.profile?.photoUrl) setExistingPhotoUrl(data.profile.photoUrl);
      setStatus("submitted");
      setShowForm(false);
      setPhotoFile(null);
      toast({ title: "Travel details saved!", description: "Jazak Allah Khair — our team will review your information." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitted = status === "submitted";
  const inputCls = "w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <Card className={`overflow-hidden rounded-2xl shadow-md border-2 ${isSubmitted ? "border-emerald-300 bg-emerald-50/50" : "border-indigo-300 bg-indigo-50/50"}`}>
      <div className={`px-5 py-4 flex items-center justify-between gap-3 ${isSubmitted ? "bg-emerald-100" : "bg-indigo-100"}`}>
        <div className="flex items-center gap-3">
          {isSubmitted
            ? <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            : <User className="w-6 h-6 text-indigo-600 shrink-0" />}
          <div>
            <h4 className="font-bold text-sm">{isSubmitted ? "Travel Details Submitted" : "Travel Details Required"}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSubmitted ? "Your passport & contact info has been saved." : "Please fill in your passport and contact information to proceed."}
            </p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          className={`text-xs shrink-0 font-semibold ${isSubmitted ? "border-emerald-400 text-emerald-700 hover:bg-emerald-50" : "border-indigo-500 text-indigo-700 hover:bg-indigo-50"}`}
          onClick={showForm ? () => setShowForm(false) : handleOpenForm}
        >
          {showForm ? "Hide Form" : isSubmitted ? "Edit Details" : "Fill Now"}
        </Button>
      </div>

      {isSubmitted && !showForm && (
        <div className="px-5 pb-4 pt-3 space-y-3">
          {loadingProfile ? (
            <p className="text-sm text-muted-foreground animate-pulse py-1">Loading your details…</p>
          ) : (
            <div className="flex gap-4 items-start">
              {existingPhotoUrl && (
                <img src={existingPhotoUrl} alt="Passport photo" className="w-14 h-14 rounded-lg object-cover border-2 border-emerald-200 shrink-0" />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 flex-1 text-sm">
                {form.name && (
                  <div><span className="text-xs text-muted-foreground">Name: </span><span className="font-semibold">{form.name}</span></div>
                )}
                {form.passportNumber && (
                  <div><span className="text-xs text-muted-foreground">Passport: </span><span className="font-mono font-semibold">{form.passportNumber}</span></div>
                )}
                {form.dateOfBirth && (
                  <div><span className="text-xs text-muted-foreground">DOB: </span><span>{form.dateOfBirth}</span></div>
                )}
                {form.gender && (
                  <div><span className="text-xs text-muted-foreground">Gender: </span><span className="capitalize">{form.gender}</span></div>
                )}
                {form.passportExpiryDate && (
                  <div><span className="text-xs text-muted-foreground">Passport Expires: </span><span>{form.passportExpiryDate}</span></div>
                )}
                {form.passportPlaceOfIssue && (
                  <div><span className="text-xs text-muted-foreground">Issued at: </span><span>{form.passportPlaceOfIssue}</span></div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="px-5 pb-5 pt-4 space-y-4">
          {loadingProfile && <p className="text-sm text-muted-foreground animate-pulse text-center py-2">Loading your saved details…</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Name (as on Passport) <span className="text-red-500">*</span></label>
              <input className={inputCls} placeholder="As printed on your passport" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date of Birth</label>
              <input className={inputCls} type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gender</label>
              <select className={inputCls} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</label>
              <input className={inputCls} placeholder="Full residential address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Number <span className="text-red-500">*</span></label>
              <input className={`${inputCls} font-mono uppercase`} placeholder="e.g. P1234567" value={form.passportNumber} onChange={e => setForm(f => ({ ...f, passportNumber: e.target.value.toUpperCase() }))} required />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Issue Date</label>
              <input className={inputCls} type="date" value={form.passportIssueDate} onChange={e => setForm(f => ({ ...f, passportIssueDate: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Expiry Date</label>
              <input className={inputCls} type="date" value={form.passportExpiryDate} onChange={e => setForm(f => ({ ...f, passportExpiryDate: e.target.value }))} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Place of Issue</label>
              <input className={inputCls} placeholder="City where passport was issued" value={form.passportPlaceOfIssue} onChange={e => setForm(f => ({ ...f, passportPlaceOfIssue: e.target.value }))} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Size Photo</label>
              <div
                className="flex items-center gap-3 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 cursor-pointer hover:border-indigo-400 transition-colors"
                onClick={() => photoInputRef.current?.click()}
              >
                {existingPhotoUrl && !photoFile && (
                  <img src={existingPhotoUrl} alt="Current photo" className="w-10 h-10 rounded object-cover border border-indigo-200 shrink-0" />
                )}
                {photoFile ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-indigo-700 truncate">{photoFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(photoFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-700">{existingPhotoUrl ? "Replace photo" : "Click to upload photo"}</p>
                    <p className="text-xs text-muted-foreground">JPG or PNG — max 5 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/jpg,image/png"
                onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={submitting} className="bg-indigo-700 hover:bg-indigo-800 text-white text-sm">
              {submitting ? <span className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving…</span> : "Save Details"}
            </Button>
            <Button type="button" variant="outline" className="text-sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function UploadModal({ bookingId, bookingNumber, onClose }: { bookingId: string; bookingNumber: string; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState("passport");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existingDocs, refetch } = useListDocuments(bookingId);

  const handleUpload = async () => {
    if (!file || !docType) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bookingId", bookingId);
      formData.append("documentType", docType);

      const res = await fetch(`${BASE_API}/api/documents/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }

      toast({ title: "Document uploaded successfully!" });
      setFile(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: [`/api/documents/${bookingId}`] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = useDeleteDocument();

  const handleDelete = async (docId: string) => {
    await deleteDoc.mutateAsync({ id: docId });
    refetch();
    queryClient.invalidateQueries({ queryKey: [`/api/documents/${bookingId}`] });
    toast({ title: "Document removed" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-primary p-6 text-white flex items-center justify-between">
          <div>
            <h3 className="text-xl font-serif font-bold">Upload Documents</h3>
            <p className="text-white/70 text-sm mt-1">Booking #{bookingNumber}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Required documents checklist */}
          <div className="bg-accent/10 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-primary mb-3">Required Documents:</p>
            {MANDATORY_DOCS.map(dt => {
              const uploaded = existingDocs?.some((d: any) => d.documentType === dt.value);
              return (
                <div key={dt.value} className="flex items-center gap-2 text-sm">
                  {uploaded
                    ? <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                    : <AlertCircle size={16} className="text-amber-400 shrink-0" />}
                  <span className={uploaded ? "text-foreground/70 line-through" : "text-foreground"}>{dt.label}</span>
                  {uploaded && <Badge className="ml-auto bg-emerald-100 text-emerald-800 text-xs">Uploaded</Badge>}
                </div>
              );
            })}
          </div>

          {/* Upload new */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Document Type</label>
              <select
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={docType}
                onChange={e => setDocType(e.target.value)}
              >
                {DOC_TYPES.map(dt => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>

            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="space-y-1">
                  <FileText size={32} className="mx-auto text-primary" />
                  <p className="text-sm font-medium text-primary">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={32} className="mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Click to select file</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG, PDF — Max 10 MB</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={uploading}
              >
                ← Back
              </Button>
              <Button
                className="flex-1 bg-primary text-white"
                disabled={!file || uploading}
                onClick={handleUpload}
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Uploading…
                  </span>
                ) : "Upload Document"}
              </Button>
            </div>
          </div>

          {/* Existing documents */}
          {existingDocs && existingDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Uploaded Documents ({existingDocs.length})</p>
              {existingDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <FileText size={18} className="text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">{DOC_TYPES.find(d => d.value === doc.documentType)?.label || doc.documentType}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.fileUrl && (
                      <a href={`${BASE_API}${doc.fileUrl}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary">
                          <Eye size={14} />
                        </Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(doc.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

const TRAVEL_DOC_TYPES: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  flight_ticket:          { label: "Flight Ticket",             icon: Plane,          color: "text-sky-700",     bg: "bg-sky-50 border-sky-200" },
  visa:                   { label: "Visa",                      icon: Stamp,          color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  hotel_voucher:          { label: "Hotel Voucher",             icon: Hotel,          color: "text-cyan-700",    bg: "bg-cyan-50 border-cyan-200" },
  room_allotment:         { label: "Room Allotment",            icon: Hotel,          color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  bus_allotment:          { label: "Bus Allotment",             icon: Bus,            color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  tour_itinerary:         { label: "Tour Itinerary",            icon: ClipboardList,  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  model_contract:         { label: "Model Contract",            icon: FileText,       color: "text-rose-700",    bg: "bg-rose-50 border-rose-200" },
  insurance:              { label: "Insurance",                 icon: ShieldAlert,    color: "text-yellow-700",  bg: "bg-yellow-50 border-yellow-200" },
  hajj_id:                { label: "Haj ID Card",               icon: User,           color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  payment_receipt:        { label: "Payment Receipt",           icon: IndianRupee,    color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  ziyarat_schedule:       { label: "Ziyarat Schedule",          icon: ClipboardList,  color: "text-lime-700",    bg: "bg-lime-50 border-lime-200" },
  passport_copy:          { label: "Passport Copy",             icon: FileText,       color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  vaccination_certificate:{ label: "Vaccination Certificate",   icon: Syringe,        color: "text-teal-700",    bg: "bg-teal-50 border-teal-200" },
  luggage_tag:            { label: "Luggage Tag",               icon: Download,       color: "text-fuchsia-700", bg: "bg-fuchsia-50 border-fuchsia-200" },
  emergency_contact_card: { label: "Emergency Contact Card",    icon: Bell,           color: "text-red-700",     bg: "bg-red-50 border-red-200" },
  other:                  { label: "Document",                  icon: FileText,       color: "text-gray-700",    bg: "bg-gray-50 border-gray-200" },
};

function TravelDocumentsCard({ bookingId, bookingNumber, invoiceNumber, bookingStatus, paidAmount }: {
  bookingId: string;
  bookingNumber: string;
  invoiceNumber: string | null;
  bookingStatus: string;
  paidAmount?: number | null;
}) {
  const BASE_API = import.meta.env.VITE_API_URL || "";
  const { toast } = useToast();
  const { data: docs, refetch } = useListDocuments(bookingId, {
    query: { refetchOnMount: "always", refetchInterval: 30000 } as any,
  });
  const allDocs = (docs || []) as any[];
  const travelDocs = allDocs.filter((d: any) => d.uploadedBy === "admin" && TRAVEL_DOC_TYPES[d.documentType]);

  const [previewDoc, setPreviewDoc] = useState<{
    url: string; name: string; isPdf: boolean; isImage: boolean; docId: string;
  } | null>(null);

  const slots = Object.keys(TRAVEL_DOC_TYPES);

  function formatFileSize(bytes?: number | null) {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function logDownload(docId: string) {
    try {
      await fetch(`${BASE_API}/api/documents/${docId}/log-download`, {
        method: "POST", credentials: "include",
      });
    } catch (_) {}
  }

  async function logView(docId: string) {
    try {
      await fetch(`${BASE_API}/api/documents/${docId}/viewed`, {
        method: "PATCH", credentials: "include",
      });
    } catch (_) {}
  }

  function openPreview(doc: any) {
    const fileUrl = `${BASE_API}${doc.fileUrl}`;
    const name = doc.fileName || "Document";
    const mime = doc.mimeType || "";
    const isPdf = name.toLowerCase().endsWith(".pdf") || mime === "application/pdf";
    const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(name) || mime.startsWith("image/");
    setPreviewDoc({ url: fileUrl, name, isPdf, isImage, docId: doc.id });
    logView(doc.id);
  }

  function handlePrint(url: string) {
    const win = window.open(url, "_blank");
    if (win) win.addEventListener("load", () => { win.focus(); win.print(); });
  }

  async function handleShare(rawUrl: string, fileName: string) {
    const fullUrl = `${window.location.origin}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
    if (navigator.share) {
      try { await navigator.share({ title: fileName, url: fullUrl }); } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(fullUrl);
        toast({ title: "Link copied!", description: "Document link copied to clipboard." });
      } catch (_) {
        toast({ title: "Share", description: fullUrl, variant: "destructive" });
      }
    }
  }

  return (
    <>
      {/* ── Preview Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!previewDoc} onOpenChange={open => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-sm font-semibold truncate flex-1">{previewDoc?.name}</DialogTitle>
              <a
                href={previewDoc?.url}
                download={previewDoc?.name}
                onClick={() => previewDoc && logDownload(previewDoc.docId)}
                className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 shrink-0"
              >
                <Download size={12} /> Download
              </a>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto bg-muted/30">
            {previewDoc?.isPdf ? (
              <iframe
                src={previewDoc.url}
                className="w-full h-full border-0"
                title={previewDoc.name}
              />
            ) : previewDoc?.isImage ? (
              <div className="flex items-center justify-center h-full p-4">
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <FileText size={48} className="opacity-30" />
                <p className="text-sm">Preview not available for this file type.</p>
                <a
                  href={previewDoc?.url}
                  download={previewDoc?.name}
                  className="text-xs bg-primary text-white px-4 py-2 rounded-lg hover:opacity-90"
                >
                  Download to view
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Document Cards ───────────────────────────────────────────────── */}
      <Card className="overflow-hidden rounded-2xl shadow-md border-2 border-primary/20">
        <div className="px-5 py-4 flex items-center gap-3 bg-primary/5 border-b border-primary/15">
          <Plane className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-primary">Your Travel Documents</h4>
            <p className="text-xs text-muted-foreground mt-0.5">Uploaded by Al Burhan Tours · auto-refreshes every 30 s</p>
          </div>
          <button
            onClick={() => refetch()}
            title="Refresh documents"
            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
          >
            <RefreshCcw size={14} />
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* ── Tax Invoice slot ──────────────────────────────────────────── */}
          {bookingNumber && Number(paidAmount || 0) > 0 && (bookingStatus === "confirmed" || bookingStatus === "partially_paid") && invoiceNumber ? (
            <div className="rounded-xl border bg-emerald-50 border-emerald-200 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/50">
                  <FileText className="w-4 h-4 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-emerald-700">TAX INVOICE</p>
                  <p className="text-[11px] text-emerald-600 font-mono mt-0.5">#{invoiceNumber}</p>
                </div>
                <span className="text-[9px] font-semibold bg-emerald-600 text-white rounded-full px-2 py-0.5 shrink-0">READY</span>
              </div>
              <div className="grid grid-cols-3 border-t border-black/5 divide-x divide-black/5">
                <button
                  onClick={() => window.open((import.meta.env.BASE_URL || "/") + "invoice/" + bookingNumber, "_blank")}
                  className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                >
                  <Eye size={15} className="text-emerald-700" />
                  <span className="text-[10px] font-medium text-muted-foreground">View</span>
                </button>
                <button
                  onClick={() => {
                    const win = window.open((import.meta.env.BASE_URL || "/") + "invoice/" + bookingNumber, "_blank");
                    if (win) win.addEventListener("load", () => { win.focus(); win.print(); });
                  }}
                  className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                >
                  <Printer size={15} className="text-emerald-700" />
                  <span className="text-[10px] font-medium text-muted-foreground">Print</span>
                </button>
                <button
                  onClick={() => window.open(
                    `https://wa.me/?text=${encodeURIComponent(`My Tax Invoice from Al Burhan Tours & Travels\nInvoice No: ${invoiceNumber}\nView here: ${window.location.origin}${import.meta.env.BASE_URL || "/"}invoice/${bookingNumber}`)}`,
                    "_blank"
                  )}
                  className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                >
                  <Share2 size={15} className="text-emerald-700" />
                  <span className="text-[10px] font-medium text-muted-foreground">WhatsApp</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-700">TAX INVOICE</p>
                <p className="text-[11px] text-amber-600 mt-0.5">⏳ Awaiting Upload</p>
              </div>
            </div>
          )}

          {/* ── All other travel doc slots ────────────────────────────────── */}
          {slots.map(type => {
            const meta = TRAVEL_DOC_TYPES[type];
            const Icon = meta.icon;
            const uploaded = travelDocs.filter((d: any) => d.documentType === type);

            if (uploaded.length === 0) {
              return (
                <div key={type} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-700">{meta.label.toUpperCase()}</p>
                    <p className="text-[11px] text-amber-600 mt-0.5">⏳ Awaiting Upload</p>
                  </div>
                </div>
              );
            }

            return uploaded.map((doc: any) => {
              const fileUrl = `${BASE_API}${doc.fileUrl}`;
              const name = doc.fileName || "Document";
              const mime = doc.mimeType || "";
              const isPdf = name.toLowerCase().endsWith(".pdf") || mime === "application/pdf";
              const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(name) || mime.startsWith("image/");
              const canPreview = isPdf || isImage;
              const uploadedDate = doc.createdAt
                ? new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                : null;
              const sizeStr = formatFileSize(doc.fileSize ?? doc.file_size);
              const colCount = isPdf ? 4 : 3;

              return (
                <div key={doc.id} className={`rounded-xl border ${meta.bg} overflow-hidden`}>
                  <div className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/50">
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {uploadedDate && (
                          <span className="text-[10px] text-muted-foreground/70">📅 {uploadedDate}</span>
                        )}
                        {sizeStr && (
                          <span className="text-[10px] text-muted-foreground/70">· {sizeStr}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-semibold bg-white/80 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                        READY
                      </span>
                      {(doc.notificationSent || doc.notification_sent) && (
                        <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                          <CheckCheck size={9} /> Sent
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`grid grid-cols-${colCount} border-t border-black/5 divide-x divide-black/5`}>
                    {canPreview ? (
                      <button
                        onClick={() => openPreview(doc)}
                        className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                      >
                        <Eye size={15} className={meta.color} />
                        <span className="text-[10px] font-medium text-muted-foreground">Preview</span>
                      </button>
                    ) : (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors"
                      >
                        <Eye size={15} className={meta.color} />
                        <span className="text-[10px] font-medium text-muted-foreground">Open</span>
                      </a>
                    )}
                    <a
                      href={fileUrl}
                      download={name}
                      onClick={() => logDownload(doc.id)}
                      className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors"
                    >
                      <Download size={15} className={meta.color} />
                      <span className="text-[10px] font-medium text-muted-foreground">Download</span>
                    </a>
                    {isPdf && (
                      <button
                        onClick={() => handlePrint(fileUrl)}
                        className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                      >
                        <Printer size={15} className={meta.color} />
                        <span className="text-[10px] font-medium text-muted-foreground">Print</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleShare(doc.fileUrl, name)}
                      className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full"
                    >
                      <Share2 size={15} className={meta.color} />
                      <span className="text-[10px] font-medium text-muted-foreground">Share</span>
                    </button>
                  </div>
                </div>
              );
            });
          })}
        </div>
      </Card>
    </>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'approved': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'confirmed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
    case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'partially_paid': return 'bg-orange-100 text-orange-800 border-orange-200';
    default: return 'bg-amber-100 text-amber-800 border-amber-200';
  }
}

function getStatusLabel(status: string) {
  if (status === 'partially_paid') return 'Partially Paid';
  return status;
}

function getStatusMessage(status: string) {
  switch (status) {
    case 'pending': return 'Your booking is under review. Our team will get back to you shortly.';
    case 'approved': return 'Booking approved! Please complete your payment to confirm.';
    case 'confirmed': return 'Booking confirmed! Jazak Allah Khair for choosing Al Burhan Tours.';
    case 'rejected': return 'Booking could not be processed. Please contact us for alternatives.';
    case 'partially_paid': return 'Partial payment received. Please pay the remaining balance to confirm your booking.';
    default: return '';
  }
}

// ── Journey Tracker — 17-step real-time progress tracker ──────────────────────

type StepState = "completed" | "current" | "upcoming" | "locked";

interface JourneyStepDef {
  key: string;
  label: string;
  icon: string;
  desc: string;
  virtual?: boolean;
}

interface JourneyStepDisplay extends JourneyStepDef {
  state: StepState;
  completedAt: string | null;
  updatedBy: string | null;
  notes: string | null;
}

const JOURNEY_STEP_DEFS: JourneyStepDef[] = [
  { key: "booking_requested",       label: "Submitted",                icon: "🕌", desc: "Your booking has been submitted successfully" },
  { key: "documents_received",      label: "Documents Received",       icon: "📋", desc: "Your travel documents have been received" },
  { key: "admin_verification",      label: "Documents Verified",       icon: "🔍", desc: "Your documents are verified by our team" },
  { key: "booking_approved",        label: "Booking Approved",         icon: "✅", desc: "Your booking has been approved by our team" },
  { key: "partial_payment_received",label: "Partial Payment Received", icon: "💰", desc: "Advance payment received — please pay the balance to confirm" },
  { key: "payment_received",        label: "Fully Paid",               icon: "💳", desc: "Full payment confirmed — your seat is reserved" },
  { key: "invoice_generated",       label: "Invoice Generated",        icon: "🧾", desc: "Your official tax invoice has been issued" },
  { key: "agreement_signed",        label: "Agreement Signed",         icon: "✍️",  desc: "Your travel agreement has been signed", virtual: true },
  { key: "visa_processing",         label: "Visa Processing",          icon: "🛂", desc: "Your visa application is being processed" },
  { key: "visa_approved",           label: "Visa Issued",              icon: "🎉", desc: "Alhamdulillah! Your visa has been approved" },
  { key: "flight_confirmed",        label: "Flight Ticket Issued",     icon: "✈️",  desc: "Your flight tickets have been confirmed" },
  { key: "hotel_confirmed",         label: "Hotel Voucher Issued",     icon: "🏨", desc: "Your hotel accommodation voucher is ready" },
  { key: "room_allocated",          label: "Room Allocated",           icon: "🛏️",  desc: "Your room has been assigned" },
  { key: "departure_ready",         label: "Departure Reminder",       icon: "🧳", desc: "All preparations for departure are complete" },
  { key: "journey_started",         label: "Departed",                 icon: "🛫", desc: "Bismillah! You have departed on your sacred journey" },
  { key: "reached_makkah",          label: "Arrived Makkah",           icon: "🕋", desc: "Alhamdulillah! You have arrived in Makkah Al-Mukarramah" },
  { key: "reached_madinah",         label: "Arrived Madinah",          icon: "🕌", desc: "Alhamdulillah! You have arrived in Madinah Al-Munawwarah" },
  { key: "return_flight",           label: "Return Flight",            icon: "✈️",  desc: "May Allah accept your ibadah — returning home" },
  { key: "journey_completed",       label: "Journey Completed",        icon: "🏠", desc: "Welcome home! Your blessed journey is complete" },
];

// Maps DB journey_status → display step index in JOURNEY_STEP_DEFS (0-indexed, virtual at index 7)
const DB_TO_DISPLAY_IDX: Record<string, number> = {
  "booking_requested": 0,  "documents_pending": 0,
  "documents_received": 1,
  "admin_verification": 2, "payment_pending": 2,
  "booking_approved": 3,
  "partial_payment_received": 4,
  "payment_received": 5,
  "invoice_generated": 6,
  // index 7 = agreement_signed (virtual — no DB status)
  "visa_processing": 8,    "visa_approved": 9,
  "flight_confirmed": 10,  "hotel_confirmed": 11,
  "bus_allocated": 12,     "room_allocated": 12,
  "departure_ready": 13,   "journey_started": 14,
  "reached_makkah": 15,    "reached_madinah": 16,
  "return_flight": 17,     "journey_completed": 18,
};

function computeJourneySteps(
  journeyStatus: string,
  agreementSigned: boolean,
  stepData: Record<string, any>
): JourneyStepDisplay[] {
  const currentIdx = DB_TO_DISPLAY_IDX[journeyStatus] ?? 0;
  const allDone = journeyStatus === "journey_completed";

  return JOURNEY_STEP_DEFS.map((def, i) => {
    let state: StepState;

    if (allDone) {
      state = "completed";
    } else if (def.virtual && def.key === "agreement_signed") {
      // Virtual step at index 7; auto-complete once past invoice_generated (idx 6)
      const agDone = agreementSigned || currentIdx >= 8;
      if (agDone) state = "completed";
      else if (currentIdx >= 6) state = "current";
      else if (currentIdx >= 3) state = "upcoming";
      else state = "locked";
    } else {
      if (i < currentIdx) state = "completed";
      else if (i === currentIdx) state = "current";
      else if (i <= currentIdx + 2) state = "upcoming";
      else state = "locked";
    }

    const d = stepData[def.key] || {};
    return {
      ...def,
      state,
      completedAt: state === "completed" ? (d.completedAt ?? null) : null,
      updatedBy: d.updatedBy ?? null,
      notes: d.notes ?? null,
    };
  });
}

function StepIconBadge({ state, icon }: { state: StepState; icon: string }) {
  if (state === "completed") {
    return (
      <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm flex-shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="relative flex-shrink-0 w-9 h-9">
        <div className="absolute inset-0 rounded-full bg-primary/25 animate-ping" style={{ animationDuration: "1.5s" }} />
        <div className="relative w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg ring-4 ring-primary/20">
          <span className="text-base leading-none">{icon}</span>
        </div>
      </div>
    );
  }
  if (state === "locked") {
    return (
      <div className="w-9 h-9 rounded-full bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  // upcoming
  return (
    <div className="w-9 h-9 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
      <span className="text-base leading-none opacity-40">{icon}</span>
    </div>
  );
}

function JourneyTracker({
  bookingId,
  initialJourneyStatus,
  agreement,
}: {
  bookingId: string;
  initialJourneyStatus: string;
  agreement?: any;
}) {
  const [journeyStatus, setJourneyStatus] = useState(initialJourneyStatus);
  const [agreementSigned, setAgreementSigned] = useState(agreement?.status === "signed");
  const [stepData, setStepData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);

  const loadSteps = useCallback(async () => {
    try {
      const r = await fetch(`${BASE_API}/api/customer/journey/${bookingId}/steps`, { credentials: "include" });
      if (!r.ok) return;
      const data = await r.json();
      if (data.journeyStatus) setJourneyStatus(data.journeyStatus);
      if (data.agreementStatus) setAgreementSigned(data.agreementStatus === "signed");
      if (data.stepData) setStepData(data.stepData);
    } catch {}
    finally { setLoading(false); }
  }, [bookingId]);

  useEffect(() => {
    loadSteps();

    const es = new EventSource(`${BASE_API}/api/customer/journey/${bookingId}/stream`, { withCredentials: true });
    es.addEventListener("journey_update", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        if (d.journeyStatus) setJourneyStatus(d.journeyStatus);
        setLiveAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        loadSteps();
      } catch {}
    });
    es.onerror = () => {};
    return () => es.close();
  }, [bookingId, loadSteps]);

  const steps = computeJourneySteps(journeyStatus, agreementSigned, stepData);
  const completedCount = steps.filter(s => s.state === "completed").length;
  const currentStep = steps.find(s => s.state === "current");
  const progressPct = Math.round((completedCount / steps.length) * 100);

  if (loading) {
    return (
      <div className="border-t border-border py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        Loading journey progress…
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      {/* Header + Progress bar */}
      <div className="px-5 pt-4 pb-3 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
              🗺️ Journey Progress
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {completedCount} of {steps.length} steps complete
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-primary leading-none">{progressPct}%</span>
            {liveAt && (
              <p className="text-[10px] text-emerald-600 flex items-center justify-end gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse" />
                Live · {liveAt}
              </p>
            )}
          </div>
        </div>

        {/* Gradient progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-primary via-blue-500 to-emerald-500 transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Current step badge */}
        {currentStep && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-semibold">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            Now: {currentStep.label}
          </div>
        )}
        {!currentStep && progressPct === 100 && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-semibold">
            🎉 Journey Completed — Alhamdulillah!
          </div>
        )}
      </div>

      {/* Steps list */}
      <div className="px-4 pb-4">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const isSelected = selectedStep === step.key;
          const canExpand = step.state === "completed" || step.state === "current";

          return (
            <div key={step.key}>
              <button
                className={`w-full flex items-start gap-3 py-2.5 text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
                onClick={() => canExpand && setSelectedStep(isSelected ? null : step.key)}
                disabled={!canExpand}
              >
                {/* Icon + vertical connector */}
                <div className="flex flex-col items-center flex-shrink-0" style={{ marginTop: "2px" }}>
                  <StepIconBadge state={step.state} icon={step.icon} />
                  {!isLast && (
                    <div
                      className="w-0.5 rounded-full mt-1 transition-all duration-500"
                      style={{
                        height: "20px",
                        background: step.state === "completed"
                          ? "linear-gradient(to bottom, #10b981, #6ee7b7)"
                          : step.state === "current"
                          ? "linear-gradient(to bottom, #3b82f6, #e0e7ff)"
                          : "#f3f4f6",
                      }}
                    />
                  )}
                </div>

                {/* Text content */}
                <div className="flex-1 pb-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold leading-tight truncate ${
                      step.state === "completed" ? "text-emerald-700" :
                      step.state === "current"   ? "text-primary" :
                      step.state === "upcoming"  ? "text-gray-700" : "text-gray-400"
                    }`}>
                      {step.label}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {step.state === "completed" && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">✓ Done</span>
                      )}
                      {step.state === "current" && (
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ animation: "pulse 2s infinite" }}>Active</span>
                      )}
                      {canExpand && (
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isSelected ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <p className={`text-[11px] mt-0.5 leading-snug ${
                    step.state === "locked"   ? "text-gray-300" :
                    step.state === "upcoming" ? "text-gray-400" : "text-muted-foreground"
                  }`}>
                    {step.state === "locked" ? "Upcoming — will be available soon" : step.desc}
                  </p>

                  {step.completedAt && (
                    <p className="text-[10px] text-emerald-600 mt-0.5 font-medium">
                      {new Date(step.completedAt).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  )}
                </div>
              </button>

              {/* Expandable details panel */}
              {isSelected && (
                <div className="ml-12 mb-2 mr-1 bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Step Details</p>
                  {step.completedAt ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      <div>
                        <p className="text-gray-400 mb-0.5">Date & Time</p>
                        <p className="font-medium text-gray-700">
                          {new Date(step.completedAt).toLocaleString("en-IN", {
                            dateStyle: "medium", timeStyle: "short"
                          })}
                        </p>
                      </div>
                      {step.updatedBy && (
                        <div>
                          <p className="text-gray-400 mb-0.5">Updated by</p>
                          <p className="font-medium text-gray-700">{step.updatedBy}</p>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {step.notes ? (
                    <div className="text-[11px]">
                      <p className="text-gray-400 mb-0.5">Notes</p>
                      <p className="text-gray-700 leading-snug">{step.notes}</p>
                    </div>
                  ) : null}
                  {!step.completedAt && !step.notes && step.state === "current" && (
                    <p className="text-[11px] text-gray-400 italic">This step is currently in progress. You will be notified when it advances.</p>
                  )}
                  {step.state === "current" && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/70 border-t border-gray-200 pt-2 mt-1">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      You will receive a WhatsApp, SMS and Email notification when this step advances.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



const NOTIF_TYPE_EMOJI: Record<string, string> = {
  mina_update: "🕌", tawaf_update: "🕋", madinah_update: "🟢",
  flight_update: "✈️", bus_update: "🚌", food_update: "🍽️",
  ziyarat_update: "🗺️", general: "📢",
};

interface CustomerNotification {
  id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string; category?: string;
}

const CATEGORY_TABS = [
  { key: "all",       label: "All",        emoji: "📋" },
  { key: "booking",   label: "Booking",    emoji: "📦" },
  { key: "payment",   label: "Payment",    emoji: "💳" },
  { key: "invoice",   label: "Invoice",    emoji: "🧾" },
  { key: "agreement", label: "Agreement",  emoji: "📝" },
  { key: "visa",      label: "Visa",       emoji: "🛂" },
  { key: "flight",    label: "Flight",     emoji: "✈️" },
  { key: "reminder",  label: "Reminder",   emoji: "⏰" },
];

function NotificationsPanel({
  notifications, onClose, onMarkRead, onMarkAllRead, onDelete, onClearAll,
  search, setSearch, category, setCategory,
}: {
  notifications: CustomerNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  search: string;
  setSearch: (s: string) => void;
  category: string;
  setCategory: (c: string) => void;
}) {
  const unread = notifications.filter(n => !n.isRead).length;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-white">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            <span className="font-bold text-base">Notifications</span>
            {unread > 0 && <span className="bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={onMarkAllRead} className="text-xs text-white/70 hover:text-white flex items-center gap-1">
                <CheckCheck size={13} /> All read
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={onClearAll} className="text-xs text-white/60 hover:text-white flex items-center gap-1" title="Clear all">
                <Trash2 size={12} />
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary bg-muted/20"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-1 px-3 py-1.5 overflow-x-auto scrollbar-none">
          {CATEGORY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setCategory(tab.key)}
              className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors ${
                category === tab.key
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-muted-foreground border-border hover:border-primary hover:text-primary"
              }`}
            >
              {tab.emoji} {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Bell className="w-10 h-10 opacity-20" />
              <p className="text-sm">{search || category !== "all" ? "No matching notifications" : "No notifications yet"}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 transition-colors hover:bg-muted/30 ${!n.isRead ? "bg-primary/5 border-l-4 border-l-primary" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0 mt-0.5">{NOTIF_TYPE_EMOJI[n.type] || NOTIF_TYPE_EMOJI[n.category || ""] || "📢"}</span>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !n.isRead && onMarkRead(n.id)}>
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-sm font-semibold leading-tight ${!n.isRead ? "text-primary" : "text-foreground"}`}>{n.title}</p>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDate(n.createdAt)}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(n.id); }}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-0.5"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-2.5 bg-muted/30 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Al Burhan Tours & Travels</p>
          <p className="text-[10px] text-muted-foreground">{notifications.length} notification{notifications.length !== 1 ? "s" : ""}</p>
        </div>
      </div>
    </div>
  );
}

interface PackageRequest {
  id: string;
  packageId: string | null;
  bookingId: string | null;
  customerName: string;
  customerMobile: string;
  packageName: string | null;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

function getRequestStatusBadge(status: string) {
  switch (status) {
    case "approved": return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">Approved</Badge>;
    case "rejected": return <Badge className="bg-red-100 text-red-800 border-red-300">Rejected</Badge>;
    default: return <Badge className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse">Pending</Badge>;
  }
}

function DetailsFormModal({ request, onClose, onSuccess }: { request: PackageRequest; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const photoRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gender: "",
    dateOfBirth: "",
    passportNumber: "",
    passportIssueDate: "",
    passportExpiryDate: "",
    passportPlaceOfIssue: "",
    address: "",
  });

  const handleChange = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.name || !form.passportNumber) {
      toast({ title: "Required fields missing", description: "Please fill in your Full Name and Passport Number.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v); });
      if (photo) formData.append("photo", photo);

      const res = await fetch(`${BASE_API}/api/requests/${request.id}/submit-details`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Submission failed");
      }
      toast({ title: "Details submitted!", description: "Your travel details have been received. Jazak Allah Khair!" });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-auto">
      <Card className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-primary p-5 text-white flex items-center justify-between">
          <div>
            <h3 className="text-xl font-serif font-bold">Fill Your Travel Details</h3>
            <p className="text-white/70 text-sm mt-0.5">{request.packageName}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Your request has been approved! Please fill in your passport details to proceed.
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Name <span className="text-red-500">*</span></Label>
            <Input placeholder="Full name as per passport" value={form.name} onChange={e => handleChange("name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gender</Label>
              <select
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={form.gender}
                onChange={e => handleChange("gender", e.target.value)}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date of Birth</Label>
              <Input type="date" value={form.dateOfBirth} onChange={e => handleChange("dateOfBirth", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Number <span className="text-red-500">*</span></Label>
            <Input placeholder="e.g. A1234567" value={form.passportNumber} onChange={e => handleChange("passportNumber", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue Date</Label>
              <Input type="date" value={form.passportIssueDate} onChange={e => handleChange("passportIssueDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expiry Date</Label>
              <Input type="date" value={form.passportExpiryDate} onChange={e => handleChange("passportExpiryDate", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Place of Issue</Label>
            <Input placeholder="City where passport was issued" value={form.passportPlaceOfIssue} onChange={e => handleChange("passportPlaceOfIssue", e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Full Address</Label>
            <textarea
              className="w-full min-h-[70px] rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Complete home address"
              value={form.address}
              onChange={e => handleChange("address", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Size Photo</Label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
              onClick={() => photoRef.current?.click()}
            >
              <input ref={photoRef} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
              {photo ? (
                <div className="space-y-1">
                  <User size={28} className="mx-auto text-primary" />
                  <p className="text-sm font-medium text-primary">{photo.name}</p>
                  <p className="text-xs text-muted-foreground">{(photo.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload size={28} className="mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Click to select photo</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG — Passport size</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button className="flex-1 bg-primary text-white" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Submitting...</span>
              ) : (
                <><Send className="w-4 h-4 mr-1" /> Submit Details</>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MyRequestsSection() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<PackageRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailsRequest, setDetailsRequest] = useState<PackageRequest | null>(null);

  const loadRequests = async () => {
    try {
      const res = await fetch(`${BASE_API}/api/requests`, { credentials: "include" });
      if (!res.ok) return;
      setRequests(await res.json());
    } catch {
      toast({ title: "Could not load requests", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, []);

  if (isLoading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" /> My Requests
        </h2>
        <Badge variant="outline" className="text-muted-foreground">{requests.length} request{requests.length !== 1 ? "s" : ""}</Badge>
      </div>

      {detailsRequest && (
        <DetailsFormModal
          request={detailsRequest}
          onClose={() => setDetailsRequest(null)}
          onSuccess={loadRequests}
        />
      )}

      <div className="space-y-3">
        {requests.map(r => (
          <Card key={r.id} className="rounded-2xl overflow-hidden shadow-sm border-border/60">
            <div className="p-4">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{formatDate(r.createdAt)}</p>
                  <p className="font-bold text-foreground">{r.packageName || "Package Request"}</p>
                  {r.message && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.message}</p>}
                  {r.rejectionReason && (
                    <div className="mt-2 flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{r.rejectionReason}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getRequestStatusBadge(r.status)}
                  {r.status === "approved" && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => setDetailsRequest(r)}>
                      Fill Your Details
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Bank Transfer Section (self-contained per booking) ────────────────────

const PAYMENT_STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  pending:              { badge: "bg-yellow-100 text-yellow-800 border-yellow-300",  label: "🟡 Awaiting Verification" },
  approved:             { badge: "bg-emerald-100 text-emerald-800 border-emerald-300", label: "✅ Payment Verified" },
  rejected:             { badge: "bg-red-100 text-red-800 border-red-300",           label: "🔴 Payment Rejected" },
  correction_requested: { badge: "bg-orange-100 text-orange-800 border-orange-300",  label: "🟠 More Info Required" },
};

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_MB = 25;

function validateProofFile(file: File): string | null {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) return "Only PDF, JPG, JPEG, PNG, WEBP files are allowed.";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `File too large. Maximum size is ${MAX_FILE_MB} MB.`;
  return null;
}

function BankTransferSection({ booking }: { booking: any }) {
  const { toast } = useToast();
  const [bankSettings, setBankSettings] = useState<any>(null);
  const [existingPayments, setExistingPayments] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ paymentReference: string; message: string } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    customerName: booking.customerName || "", mobile: booking.customerMobile || "",
    email: booking.customerEmail || "",
    amountPaid: "", paymentDate: new Date().toISOString().slice(0, 10),
    paymentTime: new Date().toTimeString().slice(0, 5),
    bankName: "", branchName: "",
    paymentMethod: "NEFT", utrNumber: "", senderAccountLast4: "", remarks: "",
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch(`${BASE_API}/api/offline-payments/bank-settings`).then(r => r.json()).then(setBankSettings).catch(() => {});
    fetch(`${BASE_API}/api/offline-payments/booking/${booking.id}`, { credentials: "include" })
      .then(r => r.json()).then(d => setExistingPayments(d.payments || [])).catch(() => {});
  }, [booking.id]);

  const latestPayment = existingPayments[0];
  const canSubmit = !latestPayment || latestPayment.status === "rejected" || latestPayment.status === "correction_requested";

  const handleFileSelect = (file: File) => {
    const err = validateProofFile(file);
    if (err) { toast({ title: "Invalid file", description: err, variant: "destructive" }); return; }
    setProofFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const reloadPayments = () =>
    fetch(`${BASE_API}/api/offline-payments/booking/${booking.id}`, { credentials: "include" })
      .then(r => r.json()).then(d => setExistingPayments(d.payments || [])).catch(() => {});

  const handleSubmit = async () => {
    if (!form.utrNumber.trim()) { toast({ title: "UTR number required", variant: "destructive" }); return; }
    if (!form.amountPaid || Number(form.amountPaid) <= 0) { toast({ title: "Valid amount required", variant: "destructive" }); return; }
    if (proofFile) {
      const err = validateProofFile(proofFile);
      if (err) { toast({ title: "Invalid file", description: err, variant: "destructive" }); return; }
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.set("bookingId", booking.id);
      if (proofFile) fd.append("proof", proofFile);
      const res = await fetch(`${BASE_API}/api/offline-payments`, { method: "POST", credentials: "include", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");
      setSubmitted({ paymentReference: data.paymentReference, message: data.message });
      setShowForm(false);
      setProofFile(null);
      reloadPayments();
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} copied!` }));
  };

  if (!["approved", "partially_paid", "confirmed"].includes(booking.status)) return null;

  return (
    <>
      {/* Success Banner after submission */}
      {submitted && (
        <div className="mx-5 mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-emerald-800">Payment Submitted Successfully</p>
              <p className="text-xs mt-0.5 text-emerald-700">{submitted.message}</p>
              {submitted.paymentReference && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-emerald-700">Reference No:</span>
                  <span className="font-mono text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{submitted.paymentReference}</span>
                  <button onClick={() => copyToClipboard(submitted.paymentReference, "Reference")} className="text-emerald-600 hover:text-emerald-800">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setSubmitted(null)} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Latest Payment Status Banner */}
      {latestPayment && !submitted && (
        <div className={`mx-5 mb-3 rounded-xl border px-4 py-3 ${PAYMENT_STATUS_STYLES[latestPayment.status]?.badge || "bg-gray-100"}`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-semibold text-sm">{PAYMENT_STATUS_STYLES[latestPayment.status]?.label || latestPayment.status}</p>
              <p className="text-xs mt-0.5 opacity-80">
                {latestPayment.payment_reference && <span>Ref: {latestPayment.payment_reference} · </span>}
                UTR: {latestPayment.utr_number} · ₹{Number(latestPayment.amount_paid).toLocaleString("en-IN")}
              </p>
              {(latestPayment.rejection_reason || latestPayment.admin_remarks) && (
                <p className="text-xs mt-1 font-medium">
                  {latestPayment.admin_remarks || latestPayment.rejection_reason}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-xs h-7 border-current" onClick={() => setShowHistory(true)}>
                History
              </Button>
              {canSubmit && (
                <Button size="sm" variant="outline" className="text-xs h-7 border-current" onClick={() => setShowForm(true)}>
                  Resubmit
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay via Bank Transfer card */}
      {!latestPayment && !submitted && (
        <div className="mx-5 mb-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-primary">Pay via Bank Transfer</p>
                <p className="text-xs text-muted-foreground">NEFT · RTGS · IMPS · UPI · Cheque · Cash</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/5" onClick={() => setShowDetails(true)}>
                <Building2 className="w-3 h-3 mr-1" /> Bank Details
              </Button>
              <Button size="sm" className="h-8 text-xs bg-primary text-white hover:bg-primary/90" onClick={() => { setShowDetails(false); setShowForm(true); }}>
                <Banknote className="w-3 h-3 mr-1" /> Submit Payment
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 size={18} className="text-primary" /> Bank Account Details</DialogTitle>
          </DialogHeader>
          {bankSettings ? (
            <div className="space-y-3">
              <div className="bg-primary/5 rounded-xl border border-primary/15 p-4 space-y-2.5">
                {[
                  { label: "Account Name", value: bankSettings.account_name },
                  { label: "Bank Name", value: bankSettings.bank_name },
                  { label: "Branch", value: bankSettings.branch },
                  { label: "Account Number", value: bankSettings.account_number, copy: true },
                  { label: "IFSC Code", value: bankSettings.ifsc_code, copy: true },
                  { label: "Account Type", value: "Current Account" },
                  bankSettings.upi_id && { label: "UPI ID", value: bankSettings.upi_id, copy: true },
                ].filter(Boolean).map((item: any) => item.value && (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-semibold text-sm">{item.value}</p>
                    </div>
                    {item.copy && (
                      <button onClick={() => copyToClipboard(item.value, item.label)} className="text-primary hover:text-primary/80 transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {bankSettings.qr_code_url && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2">Scan to Pay via UPI</p>
                  <img src={bankSettings.qr_code_url} alt="UPI QR" className="mx-auto rounded-xl border max-h-48 object-contain" />
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">After payment, click "Submit Payment" with your UTR number</p>
              <Button className="w-full bg-primary text-white" onClick={() => { setShowDetails(false); setShowForm(true); }}>
                <Banknote className="w-4 h-4 mr-2" /> I've Paid — Submit Details
              </Button>
            </div>
          ) : <div className="text-center text-muted-foreground py-8">Loading bank details…</div>}
        </DialogContent>
      </Dialog>

      {/* Submit Payment Form Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote size={18} className="text-primary" /> Submit Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Booking ID</Label>
                <Input className="h-9 text-sm mt-1 bg-muted/40" value={`#${booking.bookingNumber}`} readOnly />
              </div>
              <div>
                <Label className="text-xs">Amount Paid (₹) <span className="text-red-500">*</span></Label>
                <Input className="h-9 text-sm mt-1" type="number" placeholder="e.g. 50000" value={form.amountPaid}
                  onChange={e => setForm(f => ({ ...f, amountPaid: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Your Name</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Full name" value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Mobile</Label>
                <Input className="h-9 text-sm mt-1" placeholder="10-digit mobile" value={form.mobile}
                  onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input className="h-9 text-sm mt-1" type="email" placeholder="your@email.com" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Payment Date</Label>
                <Input className="h-9 text-sm mt-1" type="date" value={form.paymentDate}
                  onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Payment Time</Label>
                <Input className="h-9 text-sm mt-1" type="time" value={form.paymentTime}
                  onChange={e => setForm(f => ({ ...f, paymentTime: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Payment Method</Label>
                <select className="w-full mt-1 h-9 border border-border rounded-md px-3 text-sm bg-white"
                  value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                  {["NEFT", "RTGS", "IMPS", "Cash Deposit", "Bank Transfer", "UPI"].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Sender Bank Name</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Your bank" value={form.bankName}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Branch Name</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Branch" value={form.branchName}
                  onChange={e => setForm(f => ({ ...f, branchName: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">UTR / Transaction Reference Number <span className="text-red-500">*</span></Label>
                <Input className="h-9 text-sm mt-1 font-mono" placeholder="12-digit UTR or reference number" value={form.utrNumber}
                  onChange={e => setForm(f => ({ ...f, utrNumber: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Sender A/C Last 4 Digits</Label>
                <Input className="h-9 text-sm mt-1 font-mono" maxLength={4} placeholder="XXXX" value={form.senderAccountLast4}
                  onChange={e => setForm(f => ({ ...f, senderAccountLast4: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Remarks (Optional)</Label>
                <Input className="h-9 text-sm mt-1" placeholder="Any note" value={form.remarks}
                  onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Upload Payment Proof (JPG / PNG / PDF, max 10 MB)</Label>
              <input type="file" accept="image/jpeg,image/png,application/pdf" className="mt-1 w-full text-sm"
                onChange={e => setProofFile(e.target.files?.[0] || null)} />
              {proofFile && <p className="text-xs text-emerald-600 mt-1">✓ {proofFile.name}</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1 bg-primary text-white hover:bg-primary/90 font-semibold" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit Payment Details"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Group Status Card ────────────────────────────────────────────────────────
const BASE_API_CUST = import.meta.env.VITE_API_URL || "";

function GroupStatusCard({ bookingId }: { bookingId: string }) {
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    fetch(`${BASE_API_CUST}/api/enterprise/my-group-status/${bookingId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading || !data?.tracking) return null;
  const t = data.tracking;
  const g = data.group;

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-teal-100 flex items-center justify-center"><Activity size={16} className="text-teal-700" /></div>
        <div>
          <p className="font-bold text-sm text-teal-800">Live Group Update</p>
          {g?.group_name && <p className="text-xs text-teal-600">{g.group_name}</p>}
        </div>
        <span className="ml-auto flex items-center gap-1 text-xs text-teal-700 font-semibold bg-teal-100 px-2 py-0.5 rounded-lg">
          <MapPin size={11} /> {t.current_city}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {t.current_activity && (
          <div className="bg-white/70 rounded-xl px-3 py-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Now</p>
            <p className="font-semibold text-sm mt-0.5">{t.current_activity}</p>
          </div>
        )}
        {t.next_activity && (
          <div className="bg-white/70 rounded-xl px-3 py-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Next</p>
            <p className="font-semibold text-sm mt-0.5">{t.next_activity}</p>
          </div>
        )}
        {t.meeting_point && (
          <div className="bg-white/70 rounded-xl px-3 py-2 col-span-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Meeting Point</p>
            <p className="font-semibold text-sm mt-0.5">📍 {t.meeting_point}</p>
          </div>
        )}
      </div>
      {t.notes && <p className="mt-2 text-xs text-teal-700 bg-teal-100/50 rounded-xl px-3 py-1.5 italic">📢 {t.notes}</p>}
      {t.updated_at && <p className="mt-1.5 text-[10px] text-muted-foreground">Updated {new Date(t.updated_at).toLocaleString("en-IN")}</p>}
    </div>
  );
}

// ── SOS Emergency Button ─────────────────────────────────────────────────────
function SOSButton({ bookingId, customerName, customerMobile }: { bookingId: string; customerName?: string; customerMobile?: string }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSOS = async () => {
    if (!confirm("⚠️ This will alert the Al Burhan emergency team immediately. Confirm?")) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE_API_CUST}/api/enterprise/sos`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, customerName, customerMobile, message: "Customer pressed SOS — needs immediate assistance" }),
      });
      if (r.ok) {
        setSent(true);
        toast({ title: "🆘 SOS sent! Emergency team has been alerted. Stay calm.", description: "You will be contacted shortly." });
      } else toast({ title: "Failed to send SOS", variant: "destructive" });
    } catch { toast({ title: "Error sending SOS", variant: "destructive" }); }
    setSending(false);
  };

  if (sent) {
    return (
      <div className="rounded-2xl bg-red-50 border-2 border-red-300 p-4 text-center">
        <p className="text-red-700 font-bold text-sm">🆘 SOS Sent</p>
        <p className="text-xs text-red-600 mt-1">Emergency team has been alerted. Stay calm and wait for a call.</p>
      </div>
    );
  }

  return (
    <button onClick={handleSOS} disabled={sending}
      className="w-full rounded-2xl border-2 border-red-300 bg-red-50 hover:bg-red-100 active:bg-red-200 transition-colors p-4 flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-xl bg-red-100 group-hover:bg-red-200 flex items-center justify-center flex-shrink-0">
        {sending ? <RefreshCcw size={18} className="text-red-700 animate-spin" /> : <AlertTriangle size={18} className="text-red-700" />}
      </div>
      <div className="text-left">
        <p className="font-bold text-sm text-red-700">Emergency SOS</p>
        <p className="text-xs text-red-500">Press to alert Al Burhan emergency team immediately</p>
      </div>
      <span className="ml-auto text-red-600 font-bold text-xs">🆘 SOS</span>
    </button>
  );
}

export default function CustomerDashboard() {
  const { user } = useAuth();
  const { data } = useListBookings();
  const bookings = data?.bookings || [];
  const { initiatePayment, isInitializing } = usePayment();
  const { toast } = useToast();
  const [uploadBookingId, setUploadBookingId] = useState<string | null>(null);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [payDialogBooking, setPayDialogBooking] = useState<any | null>(null);
  const [partialInput, setPartialInput] = useState<string>("");
  const [payMode, setPayMode] = useState<"full" | "partial">("full");
  const [paymentSuccess, setPaymentSuccess] = useState<{ booking: any; isPartial: boolean; paidAmount: number } | null>(null);

  const { permission: pushPermission, isSubscribed: pushSubscribed, subscribe: enablePush, isLoading: pushLoading } = usePushNotifications();

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = React.useRef(0);
  const [notifSearch, setNotifSearch] = useState("");
  const [notifCategory, setNotifCategory] = useState("all");
  const [agreementsByBooking, setAgreementsByBooking] = useState<Record<string, any>>({});

  const [paymentHistory, setPaymentHistory] = useState<Record<string, any[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});
  const [showPayHistory, setShowPayHistory] = useState<Record<string, boolean>>({});
  const [downloadingReceipt, setDownloadingReceipt] = useState<Record<string, boolean>>({});

  const [profileExt, setProfileExt] = useState<{ blood_group?: string; emergency_contact_name?: string; emergency_contact_mobile?: string }>({});
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const emptyProfileForm = {
    name: "", email: "", blood_group: "", emergency_contact_name: "", emergency_contact_mobile: "",
    dateOfBirth: "", gender: "", address: "",
    passportNumber: "", passportIssueDate: "", passportExpiryDate: "", passportPlaceOfIssue: "",
    aadharNumber: "", panNumber: "",
  };
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetch(`${BASE_API}/api/auth/me`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setProfileExt({ blood_group: d.blood_group, emergency_contact_name: d.emergency_contact_name, emergency_contact_mobile: d.emergency_contact_mobile });
        setProfileForm({
          name: d.name || "", email: d.email || "", blood_group: d.blood_group || "",
          emergency_contact_name: d.emergency_contact_name || "", emergency_contact_mobile: d.emergency_contact_mobile || "",
          dateOfBirth: d.dateOfBirth || "", gender: d.gender || "", address: d.address || "",
          passportNumber: d.passportNumber || "", passportIssueDate: d.passportIssueDate || "",
          passportExpiryDate: d.passportExpiryDate || "", passportPlaceOfIssue: d.passportPlaceOfIssue || "",
          aadharNumber: d.aadharNumber || "", panNumber: d.panNumber || "",
        });
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch(`${BASE_API}/api/auth/profile`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      let data: any = null;
      try { data = await res.json(); } catch { /* no body */ }
      if (!res.ok) {
        throw new Error(data?.message || (res.status === 401 ? "Your session has expired. Please log in again." : "Could not save your details. Please try again."));
      }
      setProfileExt({ blood_group: data.blood_group, emergency_contact_name: data.emergency_contact_name, emergency_contact_mobile: data.emergency_contact_mobile });
      setShowProfileEdit(false);
      toast({ title: "Profile updated!", description: "Your details have been saved." });
    } catch (err: any) {
      toast({ title: "Could not save profile", description: err?.message || "Something went wrong. Please try again.", variant: "destructive" });
    } finally { setSavingProfile(false); }
  };

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_API}/api/notifications/my/unread-count`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const newCount = data.count || 0;
      if (newCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
        if (newCount > prevUnreadRef.current) {
          toast({ title: "New Message!", description: "You have a new notification from Al Burhan Tours.", duration: 5000 });
        }
      }
      prevUnreadRef.current = newCount;
      setUnreadCount(newCount);
    } catch {}
  }, [toast]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const reloadAgreements = useCallback(() => {
    fetch(`${BASE_API}/api/agreements/my`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const map: Record<string, any> = {};
        (d.agreements || []).forEach((ag: any) => { map[ag.booking_id] = ag; });
        setAgreementsByBooking(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reloadAgreements();
    const iv = setInterval(reloadAgreements, 30000);
    return () => clearInterval(iv);
  }, [reloadAgreements]);

  const loadNotifications = useCallback(async (search?: string, category?: string) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${BASE_API}/api/notifications/my${qs}`, { credentials: "include" });
      if (!res.ok) return;
      setNotifications(await res.json());
    } catch {}
  }, []);

  const handleOpenNotifications = () => {
    setShowNotifications(true);
    setNotifSearch("");
    setNotifCategory("all");
    loadNotifications();
  };

  const handleNotifSearch = (s: string) => {
    setNotifSearch(s);
    loadNotifications(s, notifCategory);
  };

  const handleNotifCategory = (c: string) => {
    setNotifCategory(c);
    loadNotifications(notifSearch, c);
  };

  const handleMarkRead = async (id: string) => {
    await fetch(`${BASE_API}/api/notifications/my/${id}/read`, { method: "PATCH", credentials: "include" });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
  };

  const handleMarkAllRead = async () => {
    await fetch(`${BASE_API}/api/notifications/my/read-all`, { method: "PATCH", credentials: "include" });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    prevUnreadRef.current = 0;
  };

  const handleDeleteNotification = async (id: string) => {
    await fetch(`${BASE_API}/api/notifications/my/${id}`, { method: "DELETE", credentials: "include" });
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleClearAllNotifications = async () => {
    await fetch(`${BASE_API}/api/notifications/my`, { method: "DELETE", credentials: "include" });
    setNotifications([]);
    setUnreadCount(0);
    prevUnreadRef.current = 0;
  };

  const uploadBooking = bookings.find((b: any) => b.id === uploadBookingId);

  const handleDownloadAgreementPdf = async (agreementId: string, agreementNumber: string) => {
    try {
      const res = await fetch(`${BASE_API}/api/agreements/my/${agreementId}/pdf`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Agreement-${agreementNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({ title: "Download Error", description: "Could not download the agreement PDF. Please try again.", variant: "destructive" });
    }
  };

  const handleDownloadInvoice = async (bookingId: string, bookingNumber?: string) => {
    try {
      // Use the public by-number endpoint (no auth required, booking number is the token).
      // Falls back to the auth-required UUID endpoint if booking number is not available.
      const url = bookingNumber
        ? `${BASE_API}/api/invoices/by-number/${encodeURIComponent(bookingNumber)}/pdf`
        : `${BASE_API}/api/invoices/${bookingId}/pdf`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Invoice-${bookingNumber || bookingId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast({ title: "Error", description: "Could not download invoice. Please try again.", variant: "destructive" });
    }
  };

  const handleDownloadReceipt = async (bookingId: string, bookingNumber?: string) => {
    setDownloadingReceipt(prev => ({ ...prev, [bookingId]: true }));
    try {
      const res = await fetch(`${BASE_API}/api/payments/receipt-pdf/${bookingId}`, { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Receipt-${bookingNumber || bookingId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Could not download receipt. Please try again.", variant: "destructive" });
    } finally {
      setDownloadingReceipt(prev => ({ ...prev, [bookingId]: false }));
    }
  };

  const loadPaymentHistory = async (bookingId: string) => {
    if (paymentHistory[bookingId] !== undefined || historyLoading[bookingId]) return;
    setHistoryLoading(prev => ({ ...prev, [bookingId]: true }));
    try {
      const res = await fetch(`${BASE_API}/api/payments/my-payments/${bookingId}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setPaymentHistory(prev => ({ ...prev, [bookingId]: d.payments || [] }));
      }
    } catch { /* silent */ } finally {
      setHistoryLoading(prev => ({ ...prev, [bookingId]: false }));
    }
  };

  const togglePayHistory = (bookingId: string) => {
    const nowShown = !showPayHistory[bookingId];
    setShowPayHistory(prev => ({ ...prev, [bookingId]: nowShown }));
    if (nowShown) loadPaymentHistory(bookingId);
  };

  return (
    <MainLayout>
      {uploadBookingId && uploadBooking && (
        <UploadModal
          bookingId={uploadBookingId}
          bookingNumber={(uploadBooking as any).bookingNumber}
          onClose={() => setUploadBookingId(null)}
        />
      )}

      {/* ── Push Notification Prompt ──────────────────────────────────────── */}
      {pushPermission === "default" && !pushSubscribed && (
        <div className="mx-3 mb-2 mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-3 shadow-sm">
          <BellRing className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Enable Push Notifications</p>
            <p className="text-xs text-amber-700 mt-0.5">Get instant alerts for payments, bookings &amp; documents.</p>
          </div>
          <button
            onClick={enablePush}
            disabled={pushLoading}
            className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-60 shrink-0"
          >
            {pushLoading ? "Enabling…" : "Enable"}
          </button>
        </div>
      )}
      {pushPermission === "granted" && pushSubscribed && (
        <div className="mx-3 mb-2 mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 flex items-center gap-2.5">
          <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs text-emerald-800 font-medium">Push notifications active — you'll receive instant alerts.</p>
        </div>
      )}

      {isInitializing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-5 max-w-xs w-full mx-4">
            <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="font-bold text-lg text-primary">Preparing Payment</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait while we connect to the payment gateway…</p>
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationsPanel
          notifications={notifications}
          onClose={() => setShowNotifications(false)}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onDelete={handleDeleteNotification}
          onClearAll={handleClearAllNotifications}
          search={notifSearch}
          setSearch={handleNotifSearch}
          category={notifCategory}
          setCategory={handleNotifCategory}
        />
      )}

      <div className="bg-primary pt-12 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <div className="container mx-auto px-4 relative z-10 flex items-start justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-2">
              Assalamu Alaikum, {user?.name || 'Pilgrim'}
            </h1>
            <p className="text-primary-foreground/80">Manage your bookings and track your sacred journey.</p>
          </div>
          <button
            onClick={handleOpenNotifications}
            className="relative mt-1 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white"
            title="Notifications"
          >
            {unreadCount > 0 ? <BellRing className="w-6 h-6" /> : <Bell className="w-6 h-6" />}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-12 relative z-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {showProfileEdit && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <Card className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="bg-primary p-4 text-white flex items-center justify-between shrink-0">
                    <h3 className="font-bold">Edit Profile</h3>
                    <button onClick={() => setShowProfileEdit(false)}><X size={18} /></button>
                  </div>
                  <div className="p-5 space-y-3 overflow-y-auto">
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Full Name</label>
                      <Input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} placeholder="As per passport" /></div>
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Email</label>
                      <Input value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" type="email" /></div>
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Date of Birth</label>
                      <Input type="date" value={profileForm.dateOfBirth} onChange={e => setProfileForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Gender</label>
                      <select className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" value={profileForm.gender} onChange={e => setProfileForm(f => ({ ...f, gender: e.target.value }))}>
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select></div>
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Address</label>
                      <Input value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} placeholder="Full residential address" /></div>
                    <div><label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Blood Group</label>
                      <select className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" value={profileForm.blood_group} onChange={e => setProfileForm(f => ({ ...f, blood_group: e.target.value }))}>
                        <option value="">Select</option>
                        {["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(g => <option key={g} value={g}>{g}</option>)}
                      </select></div>
                    <div className="border-t pt-3 mt-1">
                      <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Passport Details</p>
                      <div className="space-y-2">
                        <Input value={profileForm.passportNumber} onChange={e => setProfileForm(f => ({ ...f, passportNumber: e.target.value }))} placeholder="Passport Number" />
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="text-[10px] text-muted-foreground block mb-0.5">Issue Date</label>
                            <Input type="date" value={profileForm.passportIssueDate} onChange={e => setProfileForm(f => ({ ...f, passportIssueDate: e.target.value }))} /></div>
                          <div><label className="text-[10px] text-muted-foreground block mb-0.5">Expiry Date</label>
                            <Input type="date" value={profileForm.passportExpiryDate} onChange={e => setProfileForm(f => ({ ...f, passportExpiryDate: e.target.value }))} /></div>
                        </div>
                        <Input value={profileForm.passportPlaceOfIssue} onChange={e => setProfileForm(f => ({ ...f, passportPlaceOfIssue: e.target.value }))} placeholder="Place of Issue" />
                      </div>
                    </div>
                    <div className="border-t pt-3 mt-1">
                      <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Identity Documents</p>
                      <div className="space-y-2">
                        <Input value={profileForm.aadharNumber} onChange={e => setProfileForm(f => ({ ...f, aadharNumber: e.target.value }))} placeholder="Aadhaar Number" />
                        <Input value={profileForm.panNumber} onChange={e => setProfileForm(f => ({ ...f, panNumber: e.target.value }))} placeholder="PAN Number" />
                      </div>
                    </div>
                    <div className="border-t pt-3 mt-1">
                      <p className="text-xs font-bold text-primary uppercase tracking-wide mb-2">Emergency Contact</p>
                      <div className="space-y-2">
                        <Input value={profileForm.emergency_contact_name} onChange={e => setProfileForm(f => ({ ...f, emergency_contact_name: e.target.value }))} placeholder="Contact person's name" />
                        <Input value={profileForm.emergency_contact_mobile} onChange={e => setProfileForm(f => ({ ...f, emergency_contact_mobile: e.target.value }))} placeholder="10-digit mobile" />
                      </div>
                    </div>
                    <Button className="w-full bg-primary text-white mt-2" onClick={handleSaveProfile} disabled={savingProfile}>
                      {savingProfile ? "Saving…" : "Save Profile"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            <Card className="overflow-hidden shadow-lg border-border/50 rounded-2xl">
              <div className="bg-gradient-to-br from-primary to-primary/80 p-5 text-white text-center">
                <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center mb-3 mx-auto">
                  <span className="text-2xl font-bold">{(user?.name || user?.mobile || "?")[0].toUpperCase()}</span>
                </div>
                <h3 className="font-bold text-base">{user?.name || <span className="italic opacity-70">Name not set</span>}</h3>
                <p className="text-white/70 text-xs mt-0.5">+91 {user?.mobile}</p>
              </div>
              <div className="p-4 space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Email</span>
                  <span className="font-medium text-xs text-right">{user?.email || <span className="italic text-muted-foreground">Not set</span>}</span>
                </div>
                {profileExt.blood_group && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Blood Group</span>
                    <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs">{profileExt.blood_group}</span>
                  </div>
                )}
                {profileExt.emergency_contact_name && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Emergency Contact</p>
                    <p className="font-semibold text-xs">{profileExt.emergency_contact_name}</p>
                    {profileExt.emergency_contact_mobile && <p className="text-muted-foreground text-xs">+91 {profileExt.emergency_contact_mobile}</p>}
                  </div>
                )}
                <button
                  onClick={() => setShowProfileEdit(true)}
                  className="w-full text-xs text-primary border border-primary/30 rounded-lg py-1.5 hover:bg-primary/5 transition-colors font-semibold mt-1"
                >
                  ✏️ Edit Profile
                </button>
              </div>
            </Card>

            {/* Agreements Summary sidebar card */}
            {(() => {
              const allAgs = Object.values(agreementsByBooking);
              const pending = allAgs.filter((ag: any) => ag.status === "pending_signature");
              const signed  = allAgs.filter((ag: any) => ag.status === "signed");
              if (allAgs.length === 0) return null;
              return (
                <Card className="overflow-hidden shadow-sm border-border/50 rounded-2xl">
                  <div className={`px-4 py-3 flex items-center gap-2 ${pending.length > 0 ? "bg-amber-50 border-b border-amber-200" : "bg-emerald-50 border-b border-emerald-200"}`}>
                    <span className="text-base">{pending.length > 0 ? "📜" : "✅"}</span>
                    <span className={`font-bold text-sm ${pending.length > 0 ? "text-amber-800" : "text-emerald-800"}`}>My Agreements</span>
                    {pending.length > 0 && (
                      <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">{pending.length} Pending</span>
                    )}
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    {pending.length > 0 && (
                      <div className="text-xs text-amber-700 font-medium bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                        ⚠️ {pending.length} agreement{pending.length > 1 ? "s" : ""} awaiting your signature.
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold">{allAgs.length}</span>
                    </div>
                    {signed.length > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Signed</span>
                        <span className="font-semibold text-emerald-700">✅ {signed.length}</span>
                      </div>
                    )}
                    {pending.length > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Pending</span>
                        <span className="font-semibold text-amber-700">⏳ {pending.length}</span>
                      </div>
                    )}
                    {pending.length > 0 && (
                      <button
                        className="w-full text-xs font-bold py-2 rounded-lg mt-1 text-white"
                        style={{ background: "#d97706" }}
                        onClick={() => {
                          const firstPending = pending[0] as any;
                          window.open((import.meta.env.BASE_URL || "/") + "agreement/" + firstPending.id + "/sign", "_blank");
                        }}
                      >
                        ✍ Sign Now
                      </button>
                    )}
                  </div>
                </Card>
              );
            })()}

            <WeatherCurrencyWidget />

            <Card className="p-5 shadow-sm border-border/50 rounded-2xl bg-accent/10">
              <h4 className="font-semibold text-sm text-primary mb-3">Need Help?</h4>
              <p className="text-xs text-muted-foreground mb-3">Our team is here to assist you with your booking.</p>
              <a href="https://wa.me/918989701701" target="_blank" rel="noreferrer">
                <Button size="sm" className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white text-xs">
                  WhatsApp Us
                </Button>
              </a>
              <p className="text-xs text-center text-muted-foreground mt-2">+91 9893225590</p>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3 space-y-8">
            <MyRequestsSection />

            <MyAgreementsSection
              agreements={Object.values(agreementsByBooking)}
              onDownload={handleDownloadAgreementPdf}
              onRefresh={reloadAgreements}
            />

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-serif font-bold text-foreground">My Bookings</h2>
              <Badge variant="outline" className="text-muted-foreground">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</Badge>
            </div>

            {bookings.length === 0 ? (
              <Card className="p-12 text-center bg-white shadow-sm border-dashed rounded-2xl">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted" />
                <h3 className="text-xl font-bold text-foreground mb-2">No bookings yet</h3>
                <p className="text-muted-foreground mb-6">Browse our packages and start your sacred journey.</p>
                <a href={(import.meta.env.BASE_URL || "/") + "packages"}>
                  <Button className="bg-primary text-white">Explore Packages</Button>
                </a>
              </Card>
            ) : (
              <div className="space-y-6">
                {bookings.map((booking: any) => (
                  <Card key={booking.id} className="overflow-hidden rounded-2xl shadow-md border-border/50 hover:shadow-lg transition-all">

                    {/* Header */}
                    <div className="p-5 border-b border-border bg-muted/10 flex flex-wrap justify-between items-center gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground font-mono mb-1">#{booking.bookingNumber}</div>
                        <h3 className="text-lg font-serif font-bold text-primary">{booking.packageName || "Package Booking"}</h3>
                        {booking.invoiceNumber && Number(booking.paidAmount || 0) > 0 && (booking.status === 'confirmed' || booking.status === 'partially_paid') && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <FileText className="w-3 h-3 text-emerald-600" />
                            <span className="text-xs font-mono text-emerald-700 font-semibold">Invoice #{booking.invoiceNumber}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {booking.status === 'confirmed' && <DocWarningBadge bookingId={booking.id} />}
                        {agreementsByBooking[booking.id] && (
                          <Badge className={`text-[10px] px-2 py-0.5 font-bold border ${
                            agreementsByBooking[booking.id].status === 'signed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse'
                          }`}>
                            📜 {agreementsByBooking[booking.id].status === 'signed' ? 'Agreement ✓' : 'Sign Agreement'}
                          </Badge>
                        )}
                        <Badge variant="outline" className={`px-3 py-1 uppercase tracking-wider text-xs font-bold ${getStatusColor(booking.status)}`}>
                          {getStatusLabel(booking.status)}
                        </Badge>
                      </div>
                    </div>

                    {/* Status message */}
                    {getStatusMessage(booking.status) && (
                      <div className={`px-5 py-3 text-sm border-b border-border ${booking.status === 'approved' ? 'bg-blue-50 text-blue-700' : booking.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : booking.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        {getStatusMessage(booking.status)}
                      </div>
                    )}

                    {/* Journey Tracker — 17-step real-time progress tracker */}
                    <JourneyTracker
                      bookingId={booking.id}
                      initialJourneyStatus={booking.journeyStatus || "booking_requested"}
                      agreement={agreementsByBooking[booking.id]}
                    />

                    {/* Core details */}
                    <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pilgrims</p>
                        <p className="font-semibold">{booking.numberOfPilgrims} Person(s)</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Departure Date</p>
                        <p className="font-semibold">{booking.preferredDepartureDate ? formatDate(booking.preferredDepartureDate) : 'To be confirmed'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Amount</p>
                        <p className="font-semibold text-primary text-lg">{booking.finalAmount ? formatCurrency(booking.finalAmount) : 'Pending'}</p>
                        {booking.gstAmount && <p className="text-xs text-muted-foreground">incl. GST ₹{Number(booking.gstAmount).toLocaleString('en-IN')}</p>}
                        {booking.status === 'partially_paid' && booking.paidAmount && (
                          <div className="mt-2 space-y-1">
                            <div className="w-full bg-orange-100 rounded-full h-2">
                              <div
                                className="bg-orange-500 h-2 rounded-full"
                                style={{ width: `${Math.min(100, (Number(booking.paidAmount) / Number(booking.finalAmount)) * 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-orange-700 font-medium">Paid: ₹{Number(booking.paidAmount).toLocaleString('en-IN')}</p>
                            <p className="text-xs text-muted-foreground">Balance: ₹{(Number(booking.finalAmount) - Number(booking.paidAmount)).toLocaleString('en-IN')}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Package details — hotel & location */}
                    {booking.packageDetails && (
                      <div className="mx-5 mb-4 rounded-xl bg-primary/5 border border-primary/15 overflow-hidden">
                        <button
                          className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
                          onClick={() => setExpandedBooking(expandedBooking === booking.id ? null : booking.id)}
                        >
                          <span>Package Itinerary & Hotel Details</span>
                          <span className="text-muted-foreground">{expandedBooking === booking.id ? "▲" : "▼"}</span>
                        </button>
                        {expandedBooking === booking.id && (
                          <div className="px-4 pb-4 space-y-3">
                            {booking.packageDetails.duration && (
                              <div className="flex gap-2 text-sm">
                                <span className="text-muted-foreground w-24 shrink-0">Duration:</span>
                                <span className="font-medium">{booking.packageDetails.duration}</span>
                              </div>
                            )}
                            {booking.packageDetails.departureDates?.length > 0 && (
                              <div className="flex gap-2 text-sm">
                                <span className="text-muted-foreground w-24 shrink-0">Departures:</span>
                                <span className="font-medium">{booking.packageDetails.departureDates.join(", ")}</span>
                              </div>
                            )}
                            {booking.packageDetails.includes?.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What's Included</p>
                                <ul className="space-y-1">
                                  {booking.packageDetails.includes.map((item: string, i: number) => (
                                    <li key={i} className="flex gap-2 text-sm">
                                      <span className="text-emerald-500 shrink-0">✓</span>
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {(booking.status === 'approved' || booking.status === 'confirmed' || booking.status === 'partially_paid') && (
                      <div className="mx-5 mb-4 space-y-4">
                        <DepartureCountdownCard
                          bookingId={booking.id}
                          departureDate={booking.preferredDepartureDate || booking.preferred_departure_date}
                        />
                        <JourneyStatusCard bookingId={booking.id} />
                        <GroupStatusCard bookingId={booking.id} />
                        <TravelDetailsCard bookingId={booking.id} initialStatus={booking.travellerDetailsStatus || "not_submitted"} />
                        <MandatoryDocumentsCard bookingId={booking.id} onOpenUpload={() => setUploadBookingId(booking.id)} />
                        <TravelDocumentsCard
                          bookingId={booking.id}
                          bookingNumber={booking.bookingNumber}
                          invoiceNumber={booking.invoiceNumber}
                          bookingStatus={booking.status}
                          paidAmount={booking.paidAmount}
                        />

                        {/* Document Center quick link */}
                        <a
                          href={(import.meta.env.BASE_URL || "/") + "customer/documents"}
                          className="flex items-center justify-between w-full px-4 py-3 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors group"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-semibold text-primary">
                            <span className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center text-xl group-hover:bg-primary/25 transition-colors">📁</span>
                            My Documents — All in One Place
                          </span>
                          <span className="text-xs text-primary/70 font-medium">View All →</span>
                        </a>

                        {/* Support Center quick link */}
                        <a
                          href={(import.meta.env.BASE_URL || "/") + "customer/support"}
                          className="flex items-center justify-between w-full px-4 py-3 rounded-2xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors group"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-semibold text-blue-700">
                            <span className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-xl group-hover:bg-blue-200 transition-colors">💬</span>
                            Support Center — Get Help
                          </span>
                          <span className="text-xs text-blue-500 font-medium">View →</span>
                        </a>

                        {/* Knowledge Center quick link */}
                        <a
                          href={(import.meta.env.BASE_URL || "/") + "knowledge"}
                          className="flex items-center justify-between w-full px-4 py-3 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors group"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-semibold text-emerald-700">
                            <span className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-xl group-hover:bg-emerald-200 transition-colors">🕋</span>
                            Hajj & Umrah Knowledge Center
                          </span>
                          <span className="text-xs text-emerald-500 font-medium">Open →</span>
                        </a>

                        {/* Emergency SOS */}
                        <SOSButton
                          bookingId={booking.id}
                          customerName={booking.customerName || booking.customer_name}
                          customerMobile={booking.customerMobile || booking.customer_mobile}
                        />
                      </div>
                    )}

                    {/* ── My Agreement Card ── */}
                    {(() => {
                      const ag = agreementsByBooking[booking.id];
                      if (!ag) return null;
                      const isPending = ag.status === "pending_signature";
                      const isSigned  = ag.status === "signed";
                      if (!isPending && !isSigned) return null;
                      return (
                        <div className="mx-5 mb-4 rounded-xl border overflow-hidden"
                          style={{
                            background: isPending
                              ? "linear-gradient(135deg,#fffbeb 0%,#fef9ec 100%)"
                              : "linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%)",
                            borderColor: isPending ? "#fcd34d" : "#6ee7b7",
                          }}>
                          <div className="px-4 py-3 border-b flex items-center gap-2"
                            style={{
                              background: isPending ? "rgba(251,191,36,0.12)" : "rgba(16,185,129,0.12)",
                              borderColor: isPending ? "#fcd34d" : "#6ee7b7",
                            }}>
                            <span className="text-base">{isPending ? "📜" : "✅"}</span>
                            <span className="font-semibold text-sm" style={{ color: isPending ? "#92400e" : "#065f46" }}>
                              {isPending ? "Hajj Agreement — Action Required" : "Hajj Agreement — Signed"}
                            </span>
                            <span className={`ml-auto text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isPending ? "bg-amber-100 text-amber-800 animate-pulse" : "bg-emerald-100 text-emerald-800"}`}>
                              {isPending ? "⏳ Pending Signature" : "✅ Signed"}
                            </span>
                          </div>
                          <div className="p-4">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: isPending ? "#92400e" : "#065f46" }}>Agreement ID</p>
                                <p className="font-mono font-bold text-sm" style={{ color: isPending ? "#78350f" : "#064e3b" }}>{ag.agreement_number}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-wider mb-0.5 font-semibold" style={{ color: isPending ? "#92400e" : "#065f46" }}>Generated</p>
                                <p className="text-xs font-medium text-muted-foreground">{new Date(ag.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
                              </div>
                            </div>
                            {isSigned && ag.signed_at && (
                              <p className="text-xs mb-3 font-medium" style={{ color: "#065f46" }}>
                                ✅ Signed on {new Date(ag.signed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                              </p>
                            )}
                            {isPending && (
                              <p className="text-xs mb-3 text-amber-700">
                                Please review and sign your Hajj Agreement to confirm your booking.
                              </p>
                            )}
                            <div className="flex gap-2 flex-wrap">
                              {isPending ? (
                                <Button
                                  size="sm"
                                  className="text-white font-semibold shadow-sm text-xs"
                                  style={{ background: "#d97706" }}
                                  onClick={() => window.open((import.meta.env.BASE_URL || "/") + "agreement/" + ag.id + "/sign", "_blank")}
                                >
                                  ✍ Sign Agreement
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="text-white font-semibold text-xs"
                                  style={{ background: "#059669" }}
                                  onClick={() => window.open((import.meta.env.BASE_URL || "/") + "agreement/" + ag.id + "/sign", "_blank")}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-1" /> View Signed Agreement
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="font-semibold text-xs"
                                style={{ borderColor: isPending ? "#d97706" : "#059669", color: isPending ? "#92400e" : "#065f46" }}
                                onClick={() => handleDownloadAgreementPdf(ag.id, ag.agreement_number)}
                              >
                                <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="font-semibold text-xs"
                                style={{ borderColor: "#9ca3af", color: "#4b5563" }}
                                onClick={() => window.open((import.meta.env.BASE_URL || "/") + "verify-agreement/" + (ag.verification_token || ag.agreement_number), "_blank")}
                              >
                                🔍 Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="font-semibold text-xs"
                                style={{ borderColor: "#9ca3af", color: "#4b5563" }}
                                onClick={() => {
                                  const tok = ag.verification_token || ag.agreement_number;
                                  const verifyUrl = `https://alburhantravels.online/verify-agreement/${tok}`;
                                  window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(verifyUrl)}`, "_blank");
                                }}
                              >
                                📷 QR
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="font-semibold text-xs"
                                style={{ borderColor: "#9ca3af", color: "#4b5563" }}
                                onClick={() => {
                                  const url = `https://alburhantravels.online/verify-agreement/${ag.verification_token || ag.agreement_number}`;
                                  navigator.clipboard?.writeText(url).catch(() => {});
                                }}
                              >
                                <Share2 className="w-3.5 h-3.5 mr-1" /> Share
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Invoice Card — only shown after payment has been made */}
                    {booking.invoiceNumber && Number(booking.paidAmount || 0) > 0 && (booking.status === 'confirmed' || booking.status === 'partially_paid') && (
                      <div className="mx-5 mb-4 rounded-xl border border-emerald-200 overflow-hidden" style={{ background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)" }}>
                        <div className="px-4 py-3 border-b border-emerald-200 flex items-center gap-2 bg-emerald-700/10">
                          <FileText className="w-4 h-4 text-emerald-700" />
                          <span className="font-semibold text-emerald-800 text-sm">
                            {booking.status === 'confirmed' ? 'Your Invoice — Booking Confirmed' : 'Your Invoice — Payment Received'}
                          </span>
                          <CheckCircle className="w-4 h-4 text-emerald-600 ml-auto" />
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-0.5">Invoice No.</p>
                              <p className="font-mono font-bold text-emerald-900 text-base">{booking.invoiceNumber}</p>
                            </div>
                            <div className="text-right">
                              {(() => {
                                const paid = Number(booking.paidAmount || 0);
                                const total = Number(booking.finalAmount || 0);
                                const isFullPaid = total > 0 && paid >= total;
                                const isPartial = paid > 0 && !isFullPaid;
                                return (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                                    isFullPaid ? "bg-emerald-600 text-white" :
                                    isPartial  ? "bg-amber-100 text-amber-800" :
                                                 "bg-gray-100 text-gray-600"
                                  }`}>
                                    {isFullPaid ? "✓ Paid" : isPartial ? "Partially Paid" : "Pending"}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <p className="text-xs text-emerald-600 uppercase tracking-wide mb-0.5">
                                {booking.status === 'partially_paid' ? 'Amount Paid' : 'Total Amount'}
                              </p>
                              <p className="font-bold text-emerald-900 text-base">
                                {booking.status === 'partially_paid' && booking.paidAmount
                                  ? formatCurrency(booking.paidAmount)
                                  : booking.finalAmount ? formatCurrency(booking.finalAmount) : '—'}
                              </p>
                              {booking.status === 'partially_paid' && booking.finalAmount && booking.paidAmount && (
                                <p className="text-xs text-amber-700 font-medium mt-0.5">
                                  Balance: {formatCurrency(Number(booking.finalAmount) - Number(booking.paidAmount))}
                                </p>
                              )}
                            </div>
                            {(booking as any).lastPaymentDate && (
                              <div>
                                <p className="text-xs text-emerald-600 uppercase tracking-wide mb-0.5">Last Payment</p>
                                <p className="text-sm font-semibold text-emerald-900">
                                  {new Date((booking as any).lastPaymentDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                              onClick={() => window.open((import.meta.env.BASE_URL || "/") + "invoice/" + booking.bookingNumber, "_blank")}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1.5" /> View Invoice
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold"
                              disabled={downloadingReceipt[booking.id]}
                              onClick={() => handleDownloadReceipt(booking.id, booking.bookingNumber)}
                            >
                              <Download className="w-3.5 h-3.5 mr-1.5" />
                              {downloadingReceipt[booking.id] ? "..." : "Receipt PDF"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-500 text-emerald-700 hover:bg-emerald-50 font-semibold"
                              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Assalamu Alaikum! My Hajj/Umrah booking with Al Burhan Tours & Travels.\n\nInvoice No: ${booking.invoiceNumber}\nBooking: #${booking.bookingNumber}\n\nView Invoice: https://alburhantravels.online/invoice/${booking.bookingNumber}`)}`, "_blank")}
                            >
                              <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
                            </Button>
                          </div>

                          {/* Payment History toggle */}
                          <div className="mt-3 border-t border-emerald-200 pt-3">
                            <button
                              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                              onClick={() => togglePayHistory(booking.id)}
                            >
                              <IndianRupee className="w-3.5 h-3.5" />
                              {showPayHistory[booking.id] ? "Hide" : "View"} Payment History
                              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showPayHistory[booking.id] ? "rotate-90" : ""}`} />
                            </button>
                            {showPayHistory[booking.id] && (
                              <div className="mt-2 space-y-1.5">
                                {historyLoading[booking.id] ? (
                                  <p className="text-xs text-emerald-600 py-2 text-center">Loading…</p>
                                ) : (paymentHistory[booking.id] || []).length === 0 ? (
                                  <p className="text-xs text-emerald-600 py-2 text-center">No payment records found.</p>
                                ) : (paymentHistory[booking.id] || []).map((pay: any, idx: number) => (
                                  <div key={pay.id || idx} className="flex justify-between items-center bg-emerald-50/80 rounded-lg px-3 py-2 text-xs border border-emerald-100">
                                    <div>
                                      <span className="font-semibold text-emerald-900">
                                        {pay.paymentDate ? new Date(pay.paymentDate).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—"}
                                      </span>
                                      <span className="ml-2 text-emerald-600 capitalize">{(pay.paymentMode || "online").replace(/_/g, " ")}</span>
                                      {pay.referenceNumber && <span className="ml-2 text-emerald-500 font-mono">#{pay.referenceNumber}</span>}
                                    </div>
                                    <span className="font-bold text-emerald-800">{formatCurrency(pay.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment Status Card — shown when balance > 0 */}
                    {(() => {
                      const finalAmt  = Number(booking.finalAmount  || 0);
                      const paidAmt   = Number(booking.paidAmount   || 0);
                      const balance   = finalAmt - paidAmt;
                      const dueDate   = (booking as any).dueDate ? new Date((booking as any).dueDate) : null;
                      if (balance <= 0 || !['approved','partially_paid'].includes(booking.status)) return null;

                      // Calculate next reminder date based on schedule
                      let nextReminderText = "";
                      if (dueDate) {
                        const istOffset = 5.5 * 60 * 60 * 1000;
                        const todayIST  = new Date(Date.now() + istOffset);
                        const dueDateIST = new Date(dueDate.getTime() + istOffset);
                        const todayMid = Date.UTC(todayIST.getUTCFullYear(), todayIST.getUTCMonth(), todayIST.getUTCDate());
                        const dueMid   = Date.UTC(dueDateIST.getUTCFullYear(), dueDateIST.getUTCMonth(), dueDateIST.getUTCDate());
                        const diff     = Math.round((dueMid - todayMid) / 86400000);
                        const slots = [7, 3, 1, 0];
                        const nextSlot = slots.find(s => diff >= s);
                        if (nextSlot !== undefined) {
                          if (nextSlot === 0) nextReminderText = "Today (due date)";
                          else {
                            const reminderDate = new Date(dueDate.getTime() - nextSlot * 86400000);
                            nextReminderText = reminderDate.toLocaleDateString("en-IN", { dateStyle: "medium" });
                          }
                        } else if (diff < 0) {
                          const daysOver = -diff;
                          const daysToNext = 3 - (daysOver % 3);
                          if (daysToNext === 3) nextReminderText = "Today (overdue)";
                          else {
                            const d = new Date(Date.now() + daysToNext * 86400000);
                            nextReminderText = d.toLocaleDateString("en-IN", { dateStyle: "medium" });
                          }
                        }
                      }

                      return (
                        <div className="mx-5 mb-4 rounded-xl border border-orange-200 overflow-hidden bg-orange-50/60">
                          <div className="px-4 py-2.5 border-b border-orange-200 flex items-center gap-2 bg-orange-100/70">
                            <IndianRupee className="w-4 h-4 text-orange-700" />
                            <span className="font-semibold text-orange-800 text-sm">Payment Status</span>
                          </div>
                          <div className="p-4 grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-orange-600 uppercase font-semibold tracking-wide">Pending Balance</p>
                              <p className="font-bold text-orange-900 text-lg font-mono">{formatCurrency(balance)}</p>
                            </div>
                            {dueDate && (
                              <div>
                                <p className="text-[10px] text-orange-600 uppercase font-semibold tracking-wide">Due Date</p>
                                <p className="font-semibold text-orange-900 text-sm">{dueDate.toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
                              </div>
                            )}
                            {nextReminderText && (
                              <div className="col-span-2">
                                <p className="text-[10px] text-orange-600 uppercase font-semibold tracking-wide">Next Reminder</p>
                                <p className="text-sm text-orange-800 flex items-center gap-1">
                                  <Bell className="w-3.5 h-3.5" /> {nextReminderText} at 9:00 AM
                                </p>
                              </div>
                            )}
                            {!dueDate && (
                              <div className="col-span-2">
                                <p className="text-[10px] text-orange-600 uppercase font-semibold tracking-wide">Reminder</p>
                                <p className="text-xs text-orange-700">Scheduled reminders will be sent — contact us for your due date</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Bank Transfer Section */}
                    <BankTransferSection booking={booking} />

                    {/* Actions */}
                    <div className="p-4 bg-muted/20 border-t border-border flex flex-wrap justify-end gap-3">
                      {(booking.status === 'approved' || booking.status === 'partially_paid') && (
                        <Button
                          onClick={() => {
                            setPayDialogBooking(booking);
                            setPartialInput("");
                            setPayMode("full");
                          }}
                          disabled={isInitializing}
                          className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          {booking.status === 'partially_paid' ? 'Pay Balance' : 'Pay Now'}
                        </Button>
                      )}

                      {booking.invoiceNumber && Number(booking.paidAmount || 0) > 0 && (booking.status === 'confirmed' || booking.status === 'partially_paid') && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownloadInvoice(booking.id, booking.bookingNumber)}
                          className="border-primary text-primary hover:bg-primary/5"
                        >
                          <Download className="w-4 h-4 mr-2" /> Download Invoice PDF
                        </Button>
                      )}

                      {(booking.status === 'approved' || booking.status === 'confirmed' || booking.status === 'pending') && (
                        <Button
                          variant="outline"
                          className="border-primary/50 text-primary hover:bg-primary/5"
                          onClick={() => setUploadBookingId(booking.id)}
                        >
                          <Upload className="w-4 h-4 mr-2" /> Upload Documents
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Payment Dialog */}
      {payDialogBooking && (() => {
        const finalAmt = Number(payDialogBooking.finalAmount || 0);
        const paidAmt = Number(payDialogBooking.paidAmount || 0);
        const balanceDue = finalAmt - paidAmt;
        const isPartiallyPaid = payDialogBooking.status === 'partially_paid';
        const parsedPartial = parseFloat(partialInput);
        const partialValid = !isNaN(parsedPartial) && parsedPartial >= 1 && parsedPartial <= balanceDue;
        const chargeAmount = payMode === 'full' ? balanceDue : (partialValid ? parsedPartial : 0);

        return (
          <Dialog open={true} onOpenChange={(open) => { if (!open) setPayDialogBooking(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <IndianRupee className="w-5 h-5 text-accent" />
                  {isPartiallyPaid ? 'Pay Remaining Balance' : 'Choose Payment Amount'}
                </DialogTitle>
                <DialogDescription>
                  {payDialogBooking.packageName || 'Booking'} — #{payDialogBooking.bookingNumber}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Amount summary */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="font-semibold">₹{finalAmt.toLocaleString('en-IN')}</span>
                  </div>
                  {paidAmt > 0 && (
                    <div className="flex justify-between text-orange-700">
                      <span>Already Paid</span>
                      <span className="font-semibold">₹{paidAmt.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-2 font-bold text-primary">
                    <span>Balance Due</span>
                    <span>₹{balanceDue.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Pay full amount option */}
                <button
                  onClick={() => setPayMode("full")}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${payMode === 'full' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                >
                  <div>
                    <p className="font-semibold text-sm">{isPartiallyPaid ? 'Pay Full Remaining Balance' : 'Pay Full Amount'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPartiallyPaid ? 'Clear your balance & confirm booking' : 'Complete payment to confirm booking'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-bold text-primary">₹{balanceDue.toLocaleString('en-IN')}</p>
                    {payMode === 'full' && <div className="w-4 h-4 rounded-full bg-primary ml-auto mt-1 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                  </div>
                </button>

                {/* Pay partial amount option */}
                <button
                  onClick={() => setPayMode("partial")}
                  className={`w-full flex items-start justify-between p-4 rounded-xl border-2 transition-all text-left ${payMode === 'partial' ? 'border-orange-400 bg-orange-50' : 'border-border hover:border-orange-300'}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-sm">Pay Custom Amount</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Pay a partial amount now, rest later</p>
                  </div>
                  {payMode === 'partial' && <div className="w-4 h-4 rounded-full bg-orange-500 ml-4 mt-0.5 flex items-center justify-center shrink-0"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                </button>

                {payMode === 'partial' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="partialAmt" className="text-sm">Enter amount to pay (₹)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                      <Input
                        id="partialAmt"
                        type="number"
                        min={1}
                        max={balanceDue}
                        value={partialInput}
                        onChange={(e) => setPartialInput(e.target.value)}
                        placeholder={`1 – ${balanceDue.toLocaleString('en-IN')}`}
                        className="pl-7"
                        autoFocus
                      />
                    </div>
                    {partialInput && !partialValid && (
                      <p className="text-xs text-destructive">Enter an amount between ₹1 and ₹{balanceDue.toLocaleString('en-IN')}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setPayDialogBooking(null)}>Cancel</Button>
                  <Button
                    className="flex-1 bg-primary text-white hover:bg-primary/90 font-semibold"
                    disabled={isInitializing || (payMode === 'partial' && !partialValid)}
                    onClick={() => {
                      const isPartial = payMode === 'partial';
                      const charge = isPartial ? parsedPartial : chargeAmount;
                      const bookingSnap = { ...payDialogBooking };
                      setPayDialogBooking(null);
                      initiatePayment(
                        bookingSnap.id,
                        bookingSnap.customerName,
                        bookingSnap.customerEmail || "",
                        bookingSnap.customerMobile,
                        isPartial ? parsedPartial : undefined,
                        (updatedBooking) => {
                          setPaymentSuccess({
                            booking: updatedBooking,
                            isPartial: updatedBooking.status === 'partially_paid',
                            paidAmount: charge,
                          });
                        }
                      );
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    {isInitializing ? 'Loading…' : `Pay ₹${chargeAmount > 0 ? chargeAmount.toLocaleString('en-IN') : '—'}`}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Payment Success Modal */}
      <Dialog open={!!paymentSuccess} onOpenChange={(open) => { if (!open) setPaymentSuccess(null); }}>
        <DialogContent className="max-w-md">
          <div className="flex flex-col items-center text-center py-4 space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-emerald-700">
                {paymentSuccess?.isPartial ? 'Partial Payment Received!' : 'Payment Successful!'}
              </h2>
              <p className="text-muted-foreground mt-1">
                {paymentSuccess?.isPartial
                  ? 'Your partial payment has been recorded. Please pay the remaining balance to confirm your booking.'
                  : 'Your booking is now confirmed. Alhamdulillah!'}
              </p>
            </div>
            <div className="w-full bg-muted/50 rounded-xl p-4 space-y-2 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking #</span>
                <span className="font-semibold">{paymentSuccess?.booking?.bookingNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-emerald-700">
                  ₹{paymentSuccess?.paidAmount?.toLocaleString('en-IN')}
                </span>
              </div>
              {!paymentSuccess?.isPartial && paymentSuccess?.booking?.invoiceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-semibold">{paymentSuccess.booking.invoiceNumber}</span>
                </div>
              )}
              {paymentSuccess?.isPartial && paymentSuccess?.booking?.finalAmount && (
                <div className="flex justify-between text-orange-700">
                  <span>Balance Remaining</span>
                  <span className="font-semibold">
                    ₹{(Number(paymentSuccess.booking.finalAmount) - Number(paymentSuccess.booking.paidAmount || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {paymentSuccess?.isPartial
                ? 'SMS and WhatsApp confirmation has been sent to your registered mobile number.'
                : 'Invoice and confirmation has been sent to your registered mobile number and email.'}
            </p>
            <div className="flex gap-3 w-full">
              {!paymentSuccess?.isPartial && paymentSuccess?.booking?.bookingNumber && (
                <Button
                  variant="outline"
                  className="flex-1 text-primary border-primary"
                  onClick={() => {
                    window.open(`${import.meta.env.BASE_URL}invoice/${paymentSuccess!.booking.bookingNumber}`, '_blank');
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  View Invoice
                </Button>
              )}
              <Button
                className="flex-1 bg-primary text-white"
                onClick={() => setPaymentSuccess(null)}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
