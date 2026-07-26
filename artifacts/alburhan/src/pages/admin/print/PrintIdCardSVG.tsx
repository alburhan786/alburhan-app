import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import JsBarcode from "jsbarcode";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Download, FileDown, Printer, RefreshCw } from "lucide-react";

const DARK = "#0d5040";
const GOLD = "#C9A23F";
const BASE_URL = import.meta.env.BASE_URL || "/";

const DEFAULT_DATA = {
  name: "MOHAMMED IBRAHIM",
  passport: "A1234567",
  mobile: "9876543210",
  maktab: "21",
  hotelMakkah: "Elaf Al Mashaer Hotel",
  hotelMakkahAr: "فندق إلاف المشاعر",
  hotelMadinah: "Al Haram Hotel",
  hotelMadinahAr: "فندق الحرم",
  hotelAziziah: "Hilton Towers Makkah",
  serial: "001",
  year: "2026",
  qrValue: "https://alburhantravels.online/verify/sample",
  barcodeValue: "A1234567",
  address: "Shop No. 8, Khanka Masjid Complex, Shanwara Road, Burhanpur",
  phone1: "9893989786",
  phone2: "9893225590",
  emergency1: "0547090786",
  emergency2: "0568780786",
};

type CardData = typeof DEFAULT_DATA;

async function imgToDataUrl(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || 100;
      c.height = img.naturalHeight || 100;
      c.getContext("2d")?.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

function svgToDataUrl(svgEl: SVGSVGElement): string {
  const str = new XMLSerializer().serializeToString(svgEl);
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(str)));
}

function downloadSvgFile(svgEl: SVGSVGElement, filename: string) {
  const serializer = new XMLSerializer();
  let str = serializer.serializeToString(svgEl);
  str = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + str;
  const blob = new Blob([str], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Assets {
  qr: string;
  barcode: string;
  logo: string;
}

function FrontSVG({ data, assets, svgRef }: { data: CardData; assets: Assets; svgRef: React.MutableRefObject<SVGSVGElement | null> }) {
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width="85mm"
      height="54mm"
      viewBox="0 0 85 54"
      style={{ display: "block" }}
    >
      <defs>
        <clipPath id="f-photo-clip">
          <rect x="2.5" y="14.5" width="16" height="20" rx="1" />
        </clipPath>
        <clipPath id="f-logo-clip">
          <circle cx="79" cy="6.5" r="4.2" />
        </clipPath>
      </defs>

      {/* White background */}
      <rect width="85" height="54" fill="#ffffff" />

      {/* ── HEADER ── */}
      <rect width="85" height="13" fill={DARK} />

      {/* Indian flag emoji area – green/white/orange stripes */}
      <rect x="2" y="1.5" width="9" height="3.3" fill="#FF9933" />
      <rect x="2" y="4.8" width="9" height="3.3" fill="#ffffff" />
      <rect x="2" y="8.1" width="9" height="3.3" fill="#138808" />
      <circle cx="6.5" cy="6.45" r="1.3" fill="none" stroke="#000080" strokeWidth="0.25" />
      <circle cx="6.5" cy="6.45" r="0.2" fill="#000080" />

      {/* Company name */}
      <text x="13" y="6" fontFamily="Arial, sans-serif" fontSize="3.6" fontWeight="bold" fill="#ffffff" letterSpacing="0.3">AL BURHAN TOURS AND TRAVELS</text>
      <text x="13" y="10.5" fontFamily="Arial, sans-serif" fontSize="2.8" fontWeight="bold" fill={GOLD} letterSpacing="1">HAJJ {data.year}</text>

      {/* Logo circle */}
      <circle cx="79" cy="6.5" r="4.5" fill="#ffffff" stroke={GOLD} strokeWidth="0.5" />
      {assets.logo ? (
        <image href={assets.logo} x="74.6" y="2.1" width="8.8" height="8.8" clipPath="url(#f-logo-clip)" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x="79" y="7.8" fontFamily="Arial, sans-serif" fontSize="3" fontWeight="bold" fill={DARK} textAnchor="middle">AB</text>
      )}

      {/* ── PHOTO SIDEBAR ── */}
      <rect x="0" y="13" width="21" height="30" fill="#f0f7f2" />
      <line x1="21" y1="13" x2="21" y2="43" stroke={GOLD} strokeWidth="0.5" />

      {/* Photo placeholder rect */}
      <rect x="2.5" y="14.5" width="16" height="20" rx="1" fill="#e0e8e4" stroke={GOLD} strokeWidth="0.5" />
      <text x="10.5" y="22.5" fontFamily="Arial, sans-serif" fontSize="5" fill="#aaa" textAnchor="middle">👤</text>
      <text x="10.5" y="27" fontFamily="Arial, sans-serif" fontSize="1.8" fill="#999" textAnchor="middle" fontWeight="bold">PHOTO</text>

      {/* Serial */}
      <text x="10.5" y="37.5" fontFamily="Arial, sans-serif" fontSize="2.5" fontWeight="bold" fill={DARK} textAnchor="middle">#{data.serial}</text>

      {/* Company phone (small) */}
      <text x="10.5" y="41" fontFamily="Arial, sans-serif" fontSize="1.6" fill="#777" textAnchor="middle">{data.phone1}</text>
      <text x="10.5" y="43" fontFamily="Arial, sans-serif" fontSize="1.6" fill="#777" textAnchor="middle">{data.phone2}</text>

      {/* ── INFO AREA ── */}
      {/* Name */}
      <text x="23" y="19.5" fontFamily="Arial, sans-serif" fontSize="4.5" fontWeight="bold" fill={DARK} style={{ textTransform: "uppercase" }}>{data.name}</text>
      <line x1="23" y1="20.5" x2="61" y2="20.5" stroke={GOLD} strokeWidth="0.3" strokeOpacity="0.5" />

      {/* Passport */}
      <text x="23" y="23.5" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">PASSPORT NO.</text>
      <text x="23" y="27" fontFamily="Arial, sans-serif" fontSize="4" fontWeight="bold" fill={DARK} letterSpacing="0.8">{data.passport}</text>

      {/* Mobile */}
      <text x="23" y="30" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">MOBILE (INDIA)</text>
      <text x="23" y="33.5" fontFamily="Arial, sans-serif" fontSize="4" fontWeight="bold" fill={DARK}>{data.mobile}</text>

      {/* Maktab */}
      <text x="23" y="36.5" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">SERVICE CTR. NO.</text>
      <text x="23" y="41.5" fontFamily="Arial, sans-serif" fontSize="5.5" fontWeight="bold" fill={DARK}>{data.maktab}</text>

      {/* ── QR CODE ── */}
      <rect x="62" y="13" width="23" height="30" fill="#ffffff" />
      <line x1="62" y1="13" x2="62" y2="43" stroke={GOLD} strokeWidth="0.3" strokeOpacity="0.4" />
      {assets.qr ? (
        <>
          <rect x="63.5" y="14" width="20" height="20" rx="1" fill="#ffffff" stroke={DARK} strokeWidth="0.6" />
          <image href={assets.qr} x="64.2" y="14.7" width="18.6" height="18.6" />
        </>
      ) : (
        <rect x="63.5" y="14" width="20" height="20" rx="1" fill="#e8e8e8" stroke={DARK} strokeWidth="0.6" />
      )}
      <text x="73.5" y="36" fontFamily="Arial, sans-serif" fontSize="1.6" fill="#888" textAnchor="middle" letterSpacing="0.2">SCAN TO VERIFY</text>

      {/* ── BARCODE ── */}
      <rect x="0" y="43" width="85" height="6" fill="#ffffff" />
      {assets.barcode ? (
        <image href={assets.barcode} x="4" y="43.2" width="77" height="5.5" preserveAspectRatio="xMidYMid meet" />
      ) : (
        <text x="42.5" y="46.5" fontFamily="Arial, sans-serif" fontSize="2" fill="#333" textAnchor="middle">{data.barcodeValue}</text>
      )}

      {/* ── FOOTER ── */}
      <rect y="49" width="85" height="5" fill={DARK} />
      {/* Emergency — red highlighted box */}
      <rect x="0.5" y="49.3" width="51" height="4.4" rx="0.8" fill="#c0000c" stroke="#ff4444" strokeWidth="0.2" />
      <text x="2.5" y="50.8" fontFamily="Arial, sans-serif" fontSize="1.6" fontWeight="bold" fill="#ffd0d0" letterSpacing="0.3">🆘 EMERGENCY (SAUDI)</text>
      <text x="2.5" y="52.6" fontFamily="Arial, sans-serif" fontSize="2.2" fontWeight="bold" fill="#ffffff" letterSpacing="0.3">{data.emergency1}</text>
      <text x="2.5" y="54.1" fontFamily="Arial, sans-serif" fontSize="2.2" fontWeight="bold" fill="#ffffff" letterSpacing="0.3">{data.emergency2}</text>
      {/* Mobile */}
      <text x="84" y="51.4" fontFamily="Arial, sans-serif" fontSize="1.5" fontWeight="bold" fill={GOLD} textAnchor="end">MOBILE</text>
      <text x="84" y="53.5" fontFamily="Arial, sans-serif" fontSize="2.3" fontWeight="bold" fill="#ffffff" textAnchor="end">{data.mobile}</text>
    </svg>
  );
}

function BackSVG({ data, assets, svgRef }: { data: CardData; assets: Assets; svgRef: React.MutableRefObject<SVGSVGElement | null> }) {
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width="85mm"
      height="54mm"
      viewBox="0 0 85 54"
      style={{ display: "block" }}
    >
      <defs>
        <clipPath id="b-logo-clip">
          <circle cx="79" cy="6.5" r="4.2" />
        </clipPath>
      </defs>

      {/* White background */}
      <rect width="85" height="54" fill="#ffffff" />

      {/* ── HEADER ── */}
      <rect width="85" height="12" fill={DARK} />
      <text x="4" y="5.5" fontFamily="Arial, sans-serif" fontSize="3.6" fontWeight="bold" fill="#ffffff" letterSpacing="0.3">AL BURHAN TOURS AND TRAVELS</text>
      <text x="4" y="9.5" fontFamily="Arial, sans-serif" fontSize="2.5" fontWeight="bold" fill={GOLD} letterSpacing="0.8">HAJJ {data.year}</text>
      {assets.logo ? (
        <>
          <circle cx="79" cy="6" r="4.5" fill="#ffffff" stroke={GOLD} strokeWidth="0.5" />
          <image href={assets.logo} x="74.6" y="1.6" width="8.8" height="8.8" clipPath="url(#b-logo-clip)" preserveAspectRatio="xMidYMid meet" />
        </>
      ) : (
        <>
          <circle cx="79" cy="6" r="4.5" fill={GOLD} />
          <text x="79" y="7.5" fontFamily="Arial, sans-serif" fontSize="3" fontWeight="bold" fill={DARK} textAnchor="middle">AB</text>
        </>
      )}

      {/* ── LEFT SECTION: Maktab + Mashariq + Emergency ── */}
      <rect x="0" y="12" width="42" height="37" fill="#fff" />
      <line x1="42" y1="12" x2="42" y2="49" stroke={GOLD} strokeWidth="0.4" strokeOpacity="0.4" />

      {/* Maktab */}
      <text x="3" y="16" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">SERVICE CENTER NO.</text>
      <text x="3" y="23" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="bold" fill={DARK}>{data.maktab}</text>

      {/* Mashariq box */}
      <rect x="2" y="24" width="38" height="10" rx="1.5" fill={`${GOLD}25`} />
      <rect x="2" y="24" width="2" height="10" rx="1" fill={GOLD} />
      <text x="5.5" y="27.5" fontFamily="Arial, sans-serif" fontSize="2.4" fontWeight="bold" fill={DARK}>Mashariq Al-Masiyah Company</text>
      <text x="39.5" y="30.5" fontFamily="Arial, sans-serif" fontSize="3.2" fontWeight="bold" fill={DARK} textAnchor="end" direction="rtl">شركة مشارق الماسية</text>
      <text x="5.5" y="33" fontFamily="Arial, sans-serif" fontSize="1.7" fill="#777">Pilgrim Service Company</text>

      {/* Emergency */}
      <text x="3" y="38" fontFamily="Arial, sans-serif" fontSize="1.9" fontWeight="bold" fill="#b91c1c" letterSpacing="0.3">🆘 EMERGENCY (SAUDI)</text>
      <text x="3" y="43" fontFamily="Arial, sans-serif" fontSize="4.5" fontWeight="bold" fill={DARK} letterSpacing="0.4">{data.emergency1}</text>
      <text x="3" y="48" fontFamily="Arial, sans-serif" fontSize="4.5" fontWeight="bold" fill={DARK} letterSpacing="0.4">{data.emergency2}</text>

      {/* ── RIGHT SECTION: Hotels + QR ── */}
      {/* Hotel Makkah 1 */}
      <text x="44" y="15.5" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">HOTEL MAKKAH 1</text>
      <text x="44" y="19" fontFamily="Arial, sans-serif" fontSize="2.8" fontWeight="bold" fill={DARK}>{data.hotelAziziah}</text>

      {/* Hotel Makkah 2 */}
      <text x="44" y="23" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">HOTEL MAKKAH 2</text>
      <text x="44" y="26.5" fontFamily="Arial, sans-serif" fontSize="2.8" fontWeight="bold" fill={DARK}>{data.hotelMakkah}</text>
      <text x="83" y="28.5" fontFamily="Arial, sans-serif" fontSize="2.5" fontWeight="bold" fill={DARK} textAnchor="end" direction="rtl">{data.hotelMakkahAr}</text>

      {/* Hotel Madinah */}
      <text x="44" y="32" fontFamily="Arial, sans-serif" fontSize="1.9" fill="#999" letterSpacing="0.3">HOTEL MADINAH</text>
      <text x="44" y="35.5" fontFamily="Arial, sans-serif" fontSize="2.8" fontWeight="bold" fill={DARK}>{data.hotelMadinah}</text>
      <text x="83" y="37.5" fontFamily="Arial, sans-serif" fontSize="2.5" fontWeight="bold" fill={DARK} textAnchor="end" direction="rtl">{data.hotelMadinahAr}</text>

      {/* QR */}
      {assets.qr && (
        <>
          <rect x="63" y="39" width="20" height="9" rx="1" fill="#fff" stroke={DARK} strokeWidth="0.5" />
          <image href={assets.qr} x="63.5" y="39.3" width="8.4" height="8.4" />
          <text x="73" y="42" fontFamily="Arial, sans-serif" fontSize="1.8" fontWeight="bold" fill={DARK}>Verify</text>
          <text x="73" y="44.5" fontFamily="Arial, sans-serif" fontSize="1.8" fontWeight="bold" fill={DARK}>Pilgrim</text>
          <text x="73" y="47" fontFamily="Arial, sans-serif" fontSize="1.5" fill="#888">SCAN QR</text>
        </>
      )}

      {/* ── FOOTER ── */}
      <rect y="49" width="85" height="5" fill={DARK} />
      <text x="4" y="51.5" fontFamily="Arial, sans-serif" fontSize="2" fontWeight="bold" fill="#ffffff">{data.address}</text>
      <text x="4" y="53.8" fontFamily="Arial, sans-serif" fontSize="1.8" fontWeight="bold" fill={GOLD}>{data.phone1}  |  {data.phone2}</text>
    </svg>
  );
}

export default function PrintIdCardSVG() {
  const frontRef = useRef<SVGSVGElement>(null);
  const backRef = useRef<SVGSVGElement>(null);
  const [assets, setAssets] = useState<Assets>({ qr: "", barcode: "", logo: "" });
  const [data] = useState<CardData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const results: Assets = { qr: "", barcode: "", logo: "" };

      // QR code
      const qrCanvas = document.getElementById("svg-qr-hidden") as HTMLCanvasElement | null;
      if (qrCanvas) results.qr = qrCanvas.toDataURL("image/png");

      // Barcode
      const bsvg = document.getElementById("svg-barcode-hidden") as SVGSVGElement | null;
      if (bsvg) {
        JsBarcode(bsvg, data.barcodeValue, {
          format: "CODE128",
          height: 40,
          displayValue: true,
          fontSize: 9,
          margin: 3,
          lineColor: "#111",
          background: "#ffffff",
        });
        results.barcode = svgToDataUrl(bsvg);
      }

      // Logo
      const logoUrl = `${window.location.origin}${BASE_URL}images/logo.png`;
      results.logo = await imgToDataUrl(logoUrl);

      setAssets(results);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [data]);

  return (
    <AdminLayout>
      {/* Hidden off-screen elements for asset generation */}
      <div style={{ position: "fixed", left: "-9999px", top: 0, opacity: 0, pointerEvents: "none" }}>
        <QRCodeCanvas id="svg-qr-hidden" value={data.qrValue} size={180} level="M" fgColor={DARK} bgColor="#ffffff" />
        <svg id="svg-barcode-hidden" xmlns="http://www.w3.org/2000/svg" />
      </div>

      <style>{`
        @media print {
          @page { size: 85mm 54mm; margin: 0; }
          body { margin: 0; background: white; }
          .no-print { display: none !important; }
          .svg-print-page { page-break-after: always; break-after: page; }
          .svg-print-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      {/* ── Toolbar ── */}
      <div className="no-print" style={{ padding: "16px 20px", background: "#f0fdf4", borderBottom: "2px solid #d1fae5", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "16px", color: DARK }}>ID Card SVG Export</div>
          <div style={{ fontSize: "12px", color: "#666" }}>85mm × 54mm · CorelDRAW / Illustrator compatible · Open SVG → Save as CDR</div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => frontRef.current && downloadSvgFile(frontRef.current, "alburhan-id-card-front.svg")}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: DARK, color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            <Download size={14} /> Front SVG
          </button>
          <button
            onClick={() => backRef.current && downloadSvgFile(backRef.current, "alburhan-id-card-back.svg")}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: GOLD, color: DARK, border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            <FileDown size={14} /> Back SVG
          </button>
          <button
            onClick={() => window.print()}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 16px", background: "#fff", color: DARK, border: `2px solid ${DARK}`, borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#666" }}>
            <RefreshCw size={12} style={{ animation: "spin 1s linear infinite" }} /> Generating assets…
          </div>
        )}
      </div>

      {/* ── How to use ── */}
      <div className="no-print" style={{ padding: "10px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: "12px", color: "#92400e", display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <span>① Download <b>Front SVG</b> + <b>Back SVG</b></span>
        <span>② Open in <b>CorelDRAW</b> or <b>Adobe Illustrator</b></span>
        <span>③ Replace placeholders with real pilgrim data</span>
        <span>④ Save as <b>.CDR</b> — print-ready at 300 DPI</span>
      </div>

      {/* ── Card Previews ── */}
      <div style={{ padding: "32px 24px", background: "#f3f4f6", minHeight: "100vh" }}>
        <div style={{ display: "flex", gap: "40px", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start" }}>

          {/* Front */}
          <div className="svg-print-page" style={{ textAlign: "center" }}>
            <div className="no-print" style={{ marginBottom: "10px", fontWeight: 700, fontSize: "13px", color: DARK, textTransform: "uppercase", letterSpacing: "1px" }}>
              Front Side
            </div>
            <div style={{ display: "inline-block", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: "4px", overflow: "hidden" }}>
              <FrontSVG data={data} assets={assets} svgRef={frontRef} />
            </div>
            <div className="no-print" style={{ marginTop: "8px", fontSize: "11px", color: "#888" }}>85mm × 54mm</div>
          </div>

          {/* Back */}
          <div className="svg-print-page" style={{ textAlign: "center" }}>
            <div className="no-print" style={{ marginBottom: "10px", fontWeight: 700, fontSize: "13px", color: DARK, textTransform: "uppercase", letterSpacing: "1px" }}>
              Back Side
            </div>
            <div style={{ display: "inline-block", boxShadow: "0 4px 24px rgba(0,0,0,0.15)", borderRadius: "4px", overflow: "hidden" }}>
              <BackSVG data={data} assets={assets} svgRef={backRef} />
            </div>
            <div className="no-print" style={{ marginTop: "8px", fontSize: "11px", color: "#888" }}>85mm × 54mm</div>
          </div>
        </div>

        {/* SVG file info */}
        <div className="no-print" style={{ marginTop: "32px", maxWidth: "700px", margin: "32px auto 0", padding: "16px 20px", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", color: DARK, marginBottom: "8px" }}>SVG File Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "12px", color: "#555" }}>
            <div><b>Format:</b> SVG 1.1 (W3C)</div>
            <div><b>Size:</b> 85mm × 54mm</div>
            <div><b>ViewBox:</b> 0 0 85 54</div>
            <div><b>Color mode:</b> RGB (HEX)</div>
            <div><b>Compatible:</b> CorelDRAW X6+, Illustrator CS5+</div>
            <div><b>Assets:</b> Embedded (base64)</div>
            <div><b>Fonts:</b> Arial, sans-serif</div>
            <div><b>Print DPI:</b> 300 (scalable vector)</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
