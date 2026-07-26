import React, { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Award, Download, Printer, Search, RefreshCw } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

type CertType = "hajj_mubarak" | "journey_completion" | "umrah" | "appreciation";

const CERT_CONFIG: Record<CertType, { label: string; title: string; arabic: string; subtitle: string; color: string; border: string }> = {
  hajj_mubarak: {
    label: "Hajj Mubarak",
    title: "حج مبارك",
    arabic: "تَقَبَّلَ اللَّهُ مِنَّا وَمِنكُم",
    subtitle: "This is to certify that the bearer has performed the sacred pilgrimage of Hajj",
    color: "from-emerald-900 to-emerald-700",
    border: "border-amber-400",
  },
  journey_completion: {
    label: "Journey Completion",
    title: "رحلة مكتملة",
    arabic: "بارك الله في رحلتك",
    subtitle: "This certifies the successful completion of the Hajj & Ziyarat journey",
    color: "from-slate-900 to-slate-700",
    border: "border-emerald-400",
  },
  umrah: {
    label: "Umrah Certificate",
    title: "عمرة مقبولة",
    arabic: "إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ",
    subtitle: "This is to certify that the bearer has performed the blessed pilgrimage of Umrah",
    color: "from-teal-900 to-teal-700",
    border: "border-amber-400",
  },
  appreciation: {
    label: "Appreciation",
    title: "شهادة تقدير",
    arabic: "جزاك الله خيراً",
    subtitle: "In recognition of their trust and choosing Al Burhan Tours & Travels",
    color: "from-amber-900 to-amber-700",
    border: "border-white",
  },
};

function CertificatePreview({
  type, pilgrimName, bookingNumber, date, packageName,
}: {
  type: CertType; pilgrimName: string; bookingNumber: string; date: string; packageName: string;
}) {
  const cfg = CERT_CONFIG[type];
  const displayDate = date ? new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div
      id="certificate-print"
      className={`relative bg-gradient-to-br ${cfg.color} text-white rounded-2xl overflow-hidden`}
      style={{ width: "794px", minHeight: "560px", fontFamily: "'Georgia', serif" }}
    >
      {/* Decorative border */}
      <div className={`absolute inset-4 rounded-xl border-2 ${cfg.border} pointer-events-none opacity-60`} />
      <div className={`absolute inset-5 rounded-xl border ${cfg.border} pointer-events-none opacity-30`} />

      {/* Ornamental corners */}
      {["top-6 left-6", "top-6 right-6", "bottom-6 left-6", "bottom-6 right-6"].map((pos, i) => (
        <div key={i} className={`absolute ${pos} text-amber-300 text-3xl opacity-70`} style={{ lineHeight: 1 }}>✦</div>
      ))}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[560px] px-16 py-12 text-center space-y-5">
        {/* Logo / Company */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-14 h-14 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-2xl">
            🕌
          </div>
          <p className="text-amber-300 text-xs font-bold tracking-[0.2em] uppercase">Al Burhan Tours & Travels</p>
          <p className="text-white/50 text-[10px] tracking-wider">Bhopal, India • alburhantravels.online</p>
        </div>

        {/* Certificate Header */}
        <div className="space-y-1">
          <p className="text-white/60 text-xs font-bold tracking-[0.3em] uppercase">Certificate of</p>
          <p className="text-2xl font-bold tracking-wide">{CERT_CONFIG[type].label}</p>
        </div>

        {/* Arabic */}
        <div className="space-y-1">
          <p className="text-3xl" style={{ fontFamily: "'Amiri', 'Arabic', serif", direction: "rtl" }}>{cfg.title}</p>
          <p className="text-amber-300/80 text-sm" style={{ direction: "rtl" }}>{cfg.arabic}</p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full max-w-xs">
          <div className="flex-1 h-px bg-amber-300/40" />
          <span className="text-amber-300 text-xs">✦</span>
          <div className="flex-1 h-px bg-amber-300/40" />
        </div>

        {/* Pilgrim name */}
        <div className="space-y-0.5">
          <p className="text-white/60 text-xs tracking-wider uppercase">Awarded To</p>
          <p className="text-3xl font-bold tracking-wide text-amber-200">{pilgrimName || "Pilgrim Name"}</p>
        </div>

        {/* Subtitle */}
        <p className="text-white/70 text-sm max-w-md leading-relaxed italic">"{cfg.subtitle}"</p>

        {/* Details row */}
        <div className="flex gap-8 text-xs text-white/60">
          {bookingNumber && <span>Booking: <span className="text-white font-semibold">{bookingNumber}</span></span>}
          {packageName && <span>Package: <span className="text-white font-semibold">{packageName}</span></span>}
          <span>Date: <span className="text-white font-semibold">{displayDate}</span></span>
        </div>

        {/* Signature */}
        <div className="flex gap-12 mt-4">
          <div className="text-center space-y-1">
            <div className="w-24 h-px bg-white/40 mx-auto" />
            <p className="text-[10px] text-white/50">Authorized Signatory</p>
            <p className="text-[10px] text-white/70 font-semibold">Al Burhan Tours & Travels</p>
          </div>
          <div className="text-center space-y-1">
            <div className="w-24 h-px bg-white/40 mx-auto" />
            <p className="text-[10px] text-white/50">Certificate Number</p>
            <p className="text-[10px] text-white/70 font-semibold">{`ABT-${Date.now().toString(36).toUpperCase()}`}</p>
          </div>
        </div>

        {/* QR placeholder */}
        <div className="absolute bottom-8 right-8 w-14 h-14 bg-white/10 rounded-lg border border-white/20 flex items-center justify-center">
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={`w-2.5 h-2.5 rounded-sm ${Math.random() > 0.5 ? "bg-white/80" : "bg-transparent"}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CertificateCenter() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [pilgrimName, setPilgrimName] = useState("");
  const [bookingNumber, setBookingNumber] = useState("");
  const [packageName, setPackageName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [certType, setCertType] = useState<CertType>("hajj_mubarak");
  const previewRef = useRef<HTMLDivElement>(null);

  const searchPilgrim = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await fetch(`${BASE_API}/api/admin/reports/pilgrims?q=${encodeURIComponent(query)}`, { credentials: "include" });
      if (r.ok) {
        const rows = await r.json();
        if (rows.length > 0) {
          const p = rows[0];
          setPilgrimName(p.full_name || p.fullName || "");
          setBookingNumber(p.booking_number || p.bookingNumber || "");
          setPackageName(p.package_name || p.packageName || "");
          toast({ title: "Pilgrim found", description: p.full_name });
        } else {
          toast({ title: "No pilgrim found", variant: "destructive" });
        }
      }
    } catch { toast({ title: "Search failed", variant: "destructive" }); }
    setSearching(false);
  };

  const handlePrint = () => {
    const el = document.getElementById("certificate-print");
    if (!el) return;
    const html = `<!DOCTYPE html><html><head><title>Certificate</title><style>
      @import url('https://fonts.googleapis.com/css2?family=Amiri&display=swap');
      body { margin: 0; padding: 20px; background: white; display: flex; justify-content: center; }
      .cert { transform-origin: top center; }
      @page { size: A4 landscape; margin: 10mm; }
    </style></head><body>${el.outerHTML}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  const handleDownloadPDF = async () => {
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const el = document.getElementById("certificate-print");
      if (!el) return;
      await html2pdf().set({
        margin: 0,
        filename: `certificate-${certType}-${pilgrimName || "pilgrim"}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "px", format: [794, 560], orientation: "landscape" },
      }).from(el).save();
    } catch (e: any) {
      toast({ title: "PDF error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Digital Certificate Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate Hajj Mubarak, Umrah, Journey Completion & Appreciation certificates</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            {/* Pilgrim search */}
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="font-semibold text-sm">Find Pilgrim</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or mobile…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchPilgrim()}
                  className="flex-1 h-9 text-sm"
                />
                <Button size="sm" onClick={searchPilgrim} disabled={searching} className="gap-1.5">
                  {searching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />} Search
                </Button>
              </div>
            </div>

            {/* Certificate type */}
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="font-semibold text-sm">Certificate Type</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CERT_CONFIG) as CertType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setCertType(t)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                      certType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted/50"
                    }`}
                  >
                    {CERT_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pilgrim details */}
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="font-semibold text-sm">Details</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Pilgrim / Recipient Name</Label>
                  <Input value={pilgrimName} onChange={e => setPilgrimName(e.target.value)} placeholder="Full name" className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Booking Number</Label>
                    <Input value={bookingNumber} onChange={e => setBookingNumber(e.target.value)} placeholder="ABT…" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Certificate Date</Label>
                    <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Package Name</Label>
                  <Input value={packageName} onChange={e => setPackageName(e.target.value)} placeholder="Package name" className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button onClick={handlePrint} variant="outline" className="flex-1 gap-2">
                <Printer size={15} /> Print
              </Button>
              <Button onClick={handleDownloadPDF} className="flex-1 gap-2">
                <Download size={15} /> Download PDF
              </Button>
            </div>
          </div>

          {/* Preview (scaled) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</p>
            <div className="overflow-hidden rounded-2xl border bg-muted/20">
              <div style={{ transform: "scale(0.45)", transformOrigin: "top left", width: "794px", height: "560px", pointerEvents: "none" }}>
                <CertificatePreview
                  type={certType}
                  pilgrimName={pilgrimName}
                  bookingNumber={bookingNumber}
                  date={date}
                  packageName={packageName}
                />
              </div>
              <div style={{ height: `${560 * 0.45}px`, marginTop: `-${560 * 0.55}px` }} />
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
