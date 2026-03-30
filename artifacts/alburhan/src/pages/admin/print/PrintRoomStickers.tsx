import { useState, useEffect, useRef, useCallback } from "react";
import { downloadPdf } from "@/lib/pdf-download";
import { useRoute } from "wouter";

const API = import.meta.env.VITE_API_URL || "";
const DARK_GREEN = "#0B3D2E";
const GOLD = "#C9A23F";
const SUPPORT_PHONE = "+91 9893989786";

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

interface Group {
  id: string;
  groupName: string;
  year: number;
  hotels?: {
    groupLeader?: string;
    makkah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
    madinah?: { name?: string; address?: string; checkIn?: string; checkOut?: string };
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
  const sorted = new Map([...map.entries()].sort((a, b) => {
    if (a[0] === "Unassigned") return 1;
    if (b[0] === "Unassigned") return -1;
    return a[0].localeCompare(b[0], undefined, { numeric: true });
  }));
  return sorted;
}

interface RoomStickerProps {
  roomNumber: string;
  pilgrims: Pilgrim[];
  hotelName: string;
  hotelCity: string;
  group: Group;
}

function RoomSticker({ roomNumber, pilgrims, hotelName, hotelCity }: RoomStickerProps) {
  const roomType = pilgrims[0]?.roomType || `${pilgrims.length} Bed`;

  const stickerStyle: React.CSSProperties = {
    width: "148mm",
    minHeight: "105mm",
    border: `2.5px solid ${DARK_GREEN}`,
    borderRadius: "4mm",
    fontFamily: "'Arial', sans-serif",
    overflow: "hidden",
    background: "#fff",
    pageBreakInside: "avoid",
    display: "inline-block",
    verticalAlign: "top",
  };

  return (
    <div style={stickerStyle} className="no-break">
      {/* Header */}
      <div style={{ background: DARK_GREEN, color: "#fff", padding: "3mm 4mm 2.5mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2.5mm", marginBottom: "1mm" }}>
          <span style={{ fontSize: "13pt" }}>🕋</span>
          <div>
            <div style={{ fontSize: "10pt", fontWeight: 900, letterSpacing: "0.3px", lineHeight: 1.1 }}>
              AL BURHAN TOURS &amp; TRAVELS
            </div>
            <div style={{ fontSize: "6.5pt", color: "#c9e0d4", marginTop: "0.5mm" }}>
              Burhanpur M.P. | +91 9893989786
            </div>
          </div>
        </div>

        {/* Hotel + Room row */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          borderTop: "0.5px solid rgba(255,255,255,0.25)", paddingTop: "2mm", marginTop: "2mm"
        }}>
          <div>
            <div style={{ fontSize: "6pt", color: "#c9e0d4", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {hotelCity} Hotel
            </div>
            <div style={{ fontSize: "9pt", fontWeight: 700, color: GOLD, marginTop: "0.3mm" }}>
              {hotelName || "—"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "6pt", color: "#c9e0d4", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Room No.
            </div>
            <div style={{
              fontSize: "22pt", fontWeight: 900, color: GOLD, lineHeight: 1,
              letterSpacing: "-0.5px"
            }}>
              {roomNumber}
            </div>
            <div style={{ fontSize: "6pt", color: "#c9e0d4" }}>
              {roomType} &nbsp;|&nbsp; {pilgrims.length} person{pilgrims.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Pilgrim Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt" }}>
        <thead>
          <tr style={{ background: "#f0f7f4" }}>
            <th style={{ padding: "1.5mm 2.5mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6.5pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "38%" }}>
              Name
            </th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6.5pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "27%" }}>
              Passport No.
            </th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "center", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6.5pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "13%" }}>
              Age/Sex
            </th>
            <th style={{ padding: "1.5mm 2mm", textAlign: "left", color: DARK_GREEN, fontWeight: 800, borderBottom: `1.5px solid ${DARK_GREEN}`, fontSize: "6.5pt", textTransform: "uppercase", letterSpacing: "0.3px", width: "22%" }}>
              Relation
            </th>
          </tr>
        </thead>
        <tbody>
          {pilgrims.map((p, i) => (
            <tr key={p.id} style={{ background: i % 2 === 0 ? "#fff" : "#f9fcfb", borderBottom: "0.5px solid #e0ece7" }}>
              <td style={{ padding: "2mm 2.5mm", fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
                {p.fullName}
                {p.mobileIndia && (
                  <div style={{ fontWeight: 400, fontSize: "6.5pt", color: "#555", marginTop: "0.3mm" }}>
                    📞 {p.mobileIndia}
                  </div>
                )}
              </td>
              <td style={{ padding: "2mm 2mm", fontFamily: "monospace", fontSize: "7pt", color: "#333", letterSpacing: "0.3px" }}>
                {p.passportNumber || "—"}
              </td>
              <td style={{ padding: "2mm 2mm", textAlign: "center", color: "#444", fontSize: "7.5pt" }}>
                {calcAge(p.dateOfBirth)}
                {p.gender && <span style={{ color: "#888", fontSize: "6pt", display: "block" }}>{p.gender.charAt(0).toUpperCase()}</span>}
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
        <span>📞 Support: <strong>{SUPPORT_PHONE}</strong></span>
        <span style={{ color: GOLD, fontWeight: 700 }}>Al Burhan Tours &amp; Travels</span>
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
  const [selectedHotel, setSelectedHotel] = useState<"makkah" | "madinah">("makkah");

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

  const hotelName = selectedHotel === "makkah"
    ? (group?.hotels?.makkah?.name || "")
    : (group?.hotels?.madinah?.name || "");
  const hotelCity = selectedHotel === "makkah" ? "Makkah" : "Madinah";

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

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: "#666" }}>
        Loading room data...
      </div>
    );
  }

  if (!group) {
    return (
      <div style={{ padding: "40px", textAlign: "center", fontFamily: "Arial", color: "#c00" }}>
        Group not found.
      </div>
    );
  }

  const withRoomCount = pilgrims.filter(p => p.roomNumber?.trim()).length;
  const withoutRoom = pilgrims.length - withRoomCount;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .sticker-grid { display: flex; flex-wrap: wrap; gap: 6mm; }
        }
        * { box-sizing: border-box; }
        .sticker-grid { display: flex; flex-wrap: wrap; gap: 6mm; padding: 4mm; }
        .no-break { page-break-inside: avoid; }
      `}</style>

      {/* Controls — hidden on print */}
      <div className="no-print" style={{
        padding: "14px 20px", background: "#fef3c7", borderBottom: "1px solid #f59e0b",
        display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center"
      }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <strong style={{ fontSize: "15px", color: "#0B3D2E" }}>🏷️ Room Sticker Generator</strong>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
            {group.groupName} ({group.year}) &nbsp;|&nbsp;
            <span style={{ color: "#c00" }}>{roomMap.size} rooms</span> &nbsp;|&nbsp;
            {pilgrims.length} pilgrims
            {withoutRoom > 0 && <span style={{ color: "#f59e0b" }}> ({withoutRoom} without room)</span>}
          </div>
        </div>

        {/* Hotel selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Hotel:</label>
          <select value={selectedHotel} onChange={e => setSelectedHotel(e.target.value as any)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}>
            <option value="makkah">Makkah — {group.hotels?.makkah?.name || "Not set"}</option>
            <option value="madinah">Madinah — {group.hotels?.madinah?.name || "Not set"}</option>
          </select>
        </div>

        {/* Room selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#555" }}>Room:</label>
          <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px", minWidth: "120px" }}>
            <option value="ALL">All Rooms ({roomMap.size})</option>
            {allRoomKeys.map(r => (
              <option key={r} value={r}>Room {r} ({roomMap.get(r)?.length} persons)</option>
            ))}
          </select>
        </div>

        {/* Action buttons */}
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

      {/* Stats bar */}
      <div className="no-print" style={{ padding: "8px 20px", background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", gap: "20px", flexWrap: "wrap" }}>
        {[...roomMap.entries()].map(([room, ps]) => (
          <button key={room} onClick={() => setSelectedRoom(room === selectedRoom ? "ALL" : room)}
            style={{
              padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700,
              cursor: "pointer", border: "1.5px solid",
              background: selectedRoom === room ? DARK_GREEN : "#f0f7f4",
              color: selectedRoom === room ? "#fff" : DARK_GREEN,
              borderColor: selectedRoom === room ? DARK_GREEN : "#c9e0d4",
            }}>
            Room {room} &bull; {ps.length}p
          </button>
        ))}
        {selectedRoom !== "ALL" && (
          <button onClick={() => setSelectedRoom("ALL")}
            style={{ padding: "3px 10px", borderRadius: "99px", fontSize: "11px", cursor: "pointer", border: "1px dashed #ccc", background: "#fff", color: "#666" }}>
            Show All
          </button>
        )}
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
              <RoomSticker
                key={room}
                roomNumber={room}
                pilgrims={ps}
                hotelName={hotelName}
                hotelCity={hotelCity}
                group={group!}
              />
            ))}
          </div>
        )}

        {/* Print footer */}
        <div style={{ padding: "4mm 4mm 2mm", fontSize: "7pt", color: "#999", textAlign: "center", marginTop: "3mm" }}>
          Generated by Al Burhan Tours &amp; Travels Admin &nbsp;|&nbsp; {new Date().toLocaleDateString("en-IN")} &nbsp;|&nbsp; {group.groupName} {group.year}
        </div>
      </div>
    </>
  );
}
