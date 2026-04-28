import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";
import { COMPANIES, getCompanyById } from "@/lib/companies";

const API = import.meta.env.VITE_API_URL || "";
const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";

interface Pilgrim {
  id: string;
  serialNumber: number;
  fullName: string;
  passportNumber?: string;
  mobileIndia?: string;
  mobileSaudi?: string;
  dateOfBirth?: string;
  gender?: string;
  relation?: string;
  roomNumber?: string;
  roomType?: string;
  bloodGroup?: string;
}

interface HotelInfo {
  name?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  googleMapsLink?: string;
}

interface Group {
  id: string;
  groupName: string;
  year: number;
  hotels?: {
    groupLeader?: string;
    makkah?: HotelInfo;
    madinah?: HotelInfo;
    aziziah?: HotelInfo;
  };
}

function calcAge(dob?: string): string {
  if (!dob) return "—";
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

function groupPilgrimsByRoom(pilgrims: Pilgrim[]): Map<string, Pilgrim[]> {
  const map = new Map<string, Pilgrim[]>();
  for (const p of pilgrims) {
    const room = (p.roomNumber || "").trim() || "Unassigned";
    if (!map.has(room)) map.set(room, []);
    map.get(room)!.push(p);
  }
  return new Map([...map.entries()].sort((a, b) => {
    if (a[0] === "Unassigned") return 1;
    if (b[0] === "Unassigned") return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  }));
}

interface RoomStickerProps {
  roomNumber: string;
  pilgrims: Pilgrim[];
  group: Group;
  companyName: string;
  companyPhone: string;
  companyPhoneSaudi: string;
}

function HotelRow({ label, info }: { label: string; info?: HotelInfo }) {
  if (!info?.name) return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "3mm", fontSize: "7pt", borderBottom: "0.5px solid rgba(255,255,255,0.15)", paddingBottom: "1mm", marginBottom: "1mm" }}>
      <span style={{ color: "#a8d5c2", minWidth: "14mm", fontWeight: 700, textTransform: "uppercase", fontSize: "5.5pt", letterSpacing: "0.3px" }}>{label}</span>
      <span style={{ color: "#fff", fontWeight: 700 }}>{info.name}</span>
      {(info.checkIn || info.checkOut) && (
        <span style={{ color: "#c9e0d4", fontSize: "6pt", marginLeft: "auto" }}>
          {info.checkIn && `In: ${info.checkIn}`}
          {info.checkIn && info.checkOut && " · "}
          {info.checkOut && `Out: ${info.checkOut}`}
        </span>
      )}
    </div>
  );
}

function RoomSticker({ roomNumber, pilgrims, group, companyName, companyPhone, companyPhoneSaudi }: RoomStickerProps) {
  const roomType = pilgrims[0]?.roomType || `${pilgrims.length} Bed`;
  const { makkah, madinah, aziziah } = group.hotels || {};
  const hasHotels = makkah?.name || madinah?.name || aziziah?.name;

  return (
    <div className="no-break" style={{
      width: "120mm",
      border: `2.5px solid ${DARK_GREEN}`,
      borderRadius: "4mm",
      fontFamily: "'Arial', sans-serif",
      overflow: "hidden",
      background: "#fff",
      pageBreakInside: "avoid",
      display: "inline-block",
      verticalAlign: "top",
    }}>
      {/* Header */}
      <div style={{ background: DARK_GREEN, color: "#fff", padding: "3mm 4mm 2.5mm" }}>
        {/* Company + Room number row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5mm" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2mm" }}>
            <span style={{ fontSize: "14pt" }}>🕋</span>
            <div>
              <div style={{ fontSize: "9.5pt", fontWeight: 900, letterSpacing: "0.2px", lineHeight: 1.1 }}>
                {companyName}
              </div>
              <div style={{ fontSize: "6pt", color: "#a8d5c2", marginTop: "0.3mm" }}>
                Tel: {companyPhone}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "5.5pt", color: "#a8d5c2", textTransform: "uppercase", letterSpacing: "0.4px" }}>Room No.</div>
            <div style={{ fontSize: "24pt", fontWeight: 900, color: GOLD, lineHeight: 0.9, letterSpacing: "-0.5px" }}>
              {roomNumber}
            </div>
            <div style={{ fontSize: "6pt", color: "#a8d5c2", marginTop: "5mm" }}>
              {roomType} · {pilgrims.length} person{pilgrims.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Hotel rows */}
        {hasHotels && (
          <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.2)", paddingTop: "2mm", marginTop: "1mm" }}>
            <HotelRow label="Makkah 1" info={aziziah} />
            <HotelRow label="Makkah 2" info={makkah} />
            <HotelRow label="Madinah" info={madinah} />
          </div>
        )}
      </div>

      {/* Pilgrim Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
        <thead>
          <tr style={{ background: "#f0f7f4" }}>
            <th style={{ padding: "1.5mm 2.5mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "40%" }}>Name</th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "28%" }}>Passport No.</th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "center", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "12%" }}>Age/Sex</th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "20%" }}>Relation</th>
          </tr>
        </thead>
        <tbody>
          {pilgrims.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fcfb", borderBottom: "0.5px solid #e0ece7" }}>
              <td style={{ padding: "2mm 2.5mm", fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
                {p.fullName}
              </td>
              <td style={{ padding: "2mm 2mm", fontFamily: "monospace", fontSize: "7pt", color: "#333", letterSpacing: "0.3px" }}>
                {p.passportNumber || "—"}
              </td>
              <td style={{ padding: "2mm 2mm", textAlign: "center", color: "#444" }}>
                <div style={{ fontSize: "8pt", fontWeight: 700 }}>{calcAge(p.dateOfBirth)}</div>
                {p.gender && <div style={{ color: "#888", fontSize: "6pt" }}>{p.gender.charAt(0).toUpperCase()}</div>}
              </td>
              <td style={{ padding: "2mm 2mm", fontWeight: 600, color: DARK_GREEN, fontSize: "7.5pt" }}>
                {p.relation || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div style={{
        background: "#f0f7f4", borderTop: `1px solid ${DARK_GREEN}20`,
        padding: "1.5mm 3mm", display: "flex", justifyContent: "space-between",
        alignItems: "center", fontSize: "6pt", color: "#555"
      }}>
        <span>📞 Support: <strong>{companyPhoneSaudi}</strong></span>
        <span style={{ color: GOLD, fontWeight: 700 }}>{companyName} · {group.groupName}</span>
      </div>
    </div>
  );
}

export default function PrintRoomStickers() {
  const [, params] = useRoute("/admin/groups/:groupId/print/room-stickers");
  const groupId = params?.groupId || "";

  const [group, setGroup] = useState<Group | null>(null);
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>("ALL");
  const [companyId, setCompanyId] = useState("alburhan");
  const company = getCompanyById(companyId);

  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([
      fetch(`${API}/api/groups/${groupId}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" }).then(r => r.json()),
    ]).then(([g, p]) => {
      setGroup(g);
      setPilgrims(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [groupId]);

  const roomMap = groupPilgrimsByRoom(pilgrims);
  const allRoomKeys = [...roomMap.keys()];
  const roomsToShow: [string, Pilgrim[]][] = selectedRoom === "ALL"
    ? [...roomMap.entries()]
    : roomMap.has(selectedRoom) ? [[selectedRoom, roomMap.get(selectedRoom)!]] : [];

  const handleDownload = useCallback(async () => {
    if (!contentRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      const roomLabel = selectedRoom === "ALL" ? "All-Rooms" : `Room-${selectedRoom}`;
      await downloadPdf(contentRef.current, {
        filename: `Room-Stickers-${group?.groupName || "group"}-${roomLabel}.pdf`,
        orientation: "portrait",
        format: "a4",
        margin: [5, 5],
        scale: 2,
      });
    } finally { setPdfLoading(false); }
  }, [group, selectedRoom, pdfLoading]);

  if (loading) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: "#666" }}>Loading room data...</div>;
  if (!group) return <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: "#c00" }}>Group not found.</div>;

  const withoutRoom = pilgrims.filter(p => !p.roomNumber?.trim()).length;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        .sticker-grid { display: flex; flex-wrap: wrap; gap: 6mm; padding: 4mm; }
        .no-break { page-break-inside: avoid; break-inside: avoid; }
      `}</style>

      {/* Controls — hidden on print */}
      <div className="no-print" style={{
        padding: "12px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center"
      }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <strong style={{ fontSize: "15px", color: "#0B3D2E" }}>🏷️ Room Sticker Generator</strong>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
            {group.groupName} ({group.year}) &nbsp;|&nbsp;
            <span style={{ color: "#c00" }}>{roomMap.size} rooms</span> &nbsp;|&nbsp;
            {pilgrims.length} pilgrims
            {withoutRoom > 0 && <span style={{ color: "#f59e0b" }}> · {withoutRoom} without room</span>}
          </div>
          {/* Hotel names preview */}
          <div style={{ fontSize: "11px", color: "#0B3D2E", marginTop: "3px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {group.hotels?.aziziah?.name && <span>🕌 Makkah 1: <strong>{group.hotels.aziziah.name}</strong></span>}
            {group.hotels?.makkah?.name && <span>🕌 Makkah 2: <strong>{group.hotels.makkah.name}</strong></span>}
            {group.hotels?.madinah?.name && <span>🕌 Madinah: <strong>{group.hotels.madinah.name}</strong></span>}
          </div>
        </div>

        {/* Company selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Company:</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}>
            {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.id === "alburhan" ? "Al Burhan Tours & Travels" : c.name}</option>)}
          </select>
        </div>

        {/* Room selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Room:</label>
          <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px", minWidth: "130px" }}>
            <option value="ALL">All Rooms ({roomMap.size})</option>
            {allRoomKeys.map(r => (
              <option key={r} value={r}>Room {r} ({roomMap.get(r)?.length} persons)</option>
            ))}
          </select>
        </div>

        <button onClick={handleDownload} disabled={pdfLoading || roomsToShow.length === 0}
          style={{ padding: "8px 18px", background: "#0B3D2E", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px", opacity: (pdfLoading || roomsToShow.length === 0) ? 0.6 : 1 }}>
          {pdfLoading ? "Generating..." : "⬇ Download PDF"}
        </button>
        <button onClick={() => window.print()}
          style={{ padding: "8px 18px", background: "#1a2744", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>
          🖨 Print
        </button>
        <button onClick={() => window.history.back()}
          style={{ padding: "8px 14px", border: "1px solid #ccc", borderRadius: "7px", cursor: "pointer", background: "#fff", fontSize: "13px" }}>
          ← Back
        </button>
      </div>

      {/* Room pill quick-filter */}
      <div className="no-print" style={{ padding: "8px 20px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setSelectedRoom("ALL")}
          style={{ padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: selectedRoom === "ALL" ? DARK_GREEN : "#f0f7f4", color: selectedRoom === "ALL" ? "#fff" : DARK_GREEN, borderColor: selectedRoom === "ALL" ? DARK_GREEN : "#c9e0d4" }}>
          All ({roomMap.size})
        </button>
        {allRoomKeys.map(r => (
          <button key={r} onClick={() => setSelectedRoom(r === selectedRoom ? "ALL" : r)}
            style={{ padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: selectedRoom === r ? DARK_GREEN : "#f0f7f4", color: selectedRoom === r ? "#fff" : DARK_GREEN, borderColor: selectedRoom === r ? DARK_GREEN : "#c9e0d4" }}>
            {r} &bull; {roomMap.get(r)?.length}p
          </button>
        ))}
      </div>

      {/* Print content */}
      <div ref={contentRef}>
        {roomsToShow.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#666", fontFamily: "Arial" }}>
            No rooms with assigned pilgrims found.
          </div>
        ) : (
          <div className="sticker-grid">
            {roomsToShow.map(([room, ps]) => (
              <RoomSticker key={room} roomNumber={room} pilgrims={ps} group={group!} companyName={company.name} companyPhone={company.phone} companyPhoneSaudi={company.phoneSaudi} />
            ))}
          </div>
        )}
        <div style={{ padding: "2mm 4mm", fontSize: "7pt", color: "#bbb", textAlign: "center" }}>
          {company.name} · {group.groupName} {group.year} · Generated {new Date().toLocaleDateString("en-IN")}
        </div>
      </div>
    </>
  );
}
