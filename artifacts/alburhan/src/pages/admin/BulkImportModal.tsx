import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, ImageIcon, Download, Upload, CheckCircle2, XCircle, AlertCircle, ChevronRight, Users } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const TEMPLATE_COLUMNS = [
  "Full Name", "Salutation", "Gender", "Date of Birth", "Passport Number",
  "Passport Issue Date", "Passport Expiry Date", "Passport Place of Issue",
  "Visa Number", "Blood Group", "Mobile India", "Mobile Saudi",
  "City", "State", "Address", "Bus Number", "Seat Number", "Cover Number",
  "Relation", "Medical Condition",
  "Family ID", "Family Head (Yes/No)", "Family Relation",
];

const COLUMN_MAP: Record<string, string> = {
  "full name": "fullName",
  "salutation": "salutation",
  "gender": "gender",
  "date of birth": "dateOfBirth",
  "dob": "dateOfBirth",
  "passport number": "passportNumber",
  "passport no": "passportNumber",
  "passport issue date": "passportIssueDate",
  "passport expiry date": "passportExpiryDate",
  "passport place of issue": "passportPlaceOfIssue",
  "visa number": "visaNumber",
  "visa no": "visaNumber",
  "blood group": "bloodGroup",
  "mobile india": "mobileIndia",
  "mobile saudi": "mobileSaudi",
  "city": "city",
  "state": "state",
  "address": "address",
  "bus number": "busNumber",
  "bus no": "busNumber",
  "seat number": "seatNumber",
  "seat no": "seatNumber",
  "cover number": "coverNumber",
  "cover no": "coverNumber",
  "relation": "relation",
  "medical condition": "medicalCondition",
  "family id": "familyId",
  "family head (yes/no)": "familyHead",
  "family head": "familyHead",
  "family relation": "familyRelation",
};

interface ParsedRow {
  index: number;
  data: Record<string, string>;
  error?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  skippedRows: any[];
}

interface PhotoResult {
  total: number;
  matched: number;
  unmatched: number;
  results: { filename: string; status: string; passportNumber?: string }[];
}

interface Props {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  existingPassports?: string[];
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pilgrims");
  ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 22 }));
  XLSX.writeFile(wb, "pilgrim_import_template.xlsx");
}

const FAMILY_TEMPLATE_COLS = ["Serial No", "Family ID", "Family Head (Yes/No)", "Family Relation"];

function downloadFamilyTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    FAMILY_TEMPLATE_COLS,
    [1, "F001", "Yes", "Head"],
    [2, "F001", "No",  "Spouse"],
    [3, "F001", "No",  "Child"],
  ]);
  ws["!cols"] = FAMILY_TEMPLATE_COLS.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "FamilyIDs");
  XLSX.writeFile(wb, "family_id_import_template.xlsx");
}

interface FamilyRow {
  rowIndex: number;
  serialNumber: number | null;
  familyId: string;
  familyHead: string;
  familyRelation: string;
  // enriched after lookup
  fullName?: string;
  currentFamilyId?: string;
  error?: string;
}

export function BulkImportModal({ groupId, open, onClose, onImported, existingPassports = [] }: Props) {
  const [tab, setTab] = useState<"excel" | "photos" | "family">("excel");
  const { toast } = useToast();

  // ── Excel tab state ────────────────────────────────────────────────────────
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  // ── Photos tab state ───────────────────────────────────────────────────────
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoResult, setPhotoResult] = useState<PhotoResult | null>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  // ── Family IDs tab state ───────────────────────────────────────────────────
  const [familyRows, setFamilyRows] = useState<FamilyRow[]>([]);
  const [familyImporting, setFamilyImporting] = useState(false);
  const [familyResult, setFamilyResult] = useState<{ updated: number; skipped: number; skippedRows: any[] } | null>(null);
  const familyRef = useRef<HTMLInputElement>(null);

  const resetExcel  = () => { setParsedRows([]); setImportResult(null); if (excelRef.current) excelRef.current.value = ""; };
  const clearExcelFile = () => { setParsedRows([]); if (excelRef.current) excelRef.current.value = ""; };
  const resetPhotos = () => { setZipFile(null); setPhotoResult(null); if (zipRef.current) zipRef.current.value = ""; };
  const resetFamily = () => { setFamilyRows([]); setFamilyResult(null); if (familyRef.current) familyRef.current.value = ""; };

  const handleClose = () => { resetExcel(); resetPhotos(); resetFamily(); onClose(); };

  // ── Family file parser ─────────────────────────────────────────────────────
  const handleFamilyFile = useCallback(async (file: File) => {
    setFamilyResult(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (raw.length < 2) { toast({ title: "File appears empty", variant: "destructive" }); return; }

        const headers = raw[0].map((h: any) => String(h).trim().toLowerCase());
        const colIdx = (name: string) => headers.findIndex(h => h === name || h.startsWith(name.split(" ")[0]));
        const snIdx  = colIdx("serial no");
        const fidIdx = colIdx("family id");
        const fhIdx  = colIdx("family head");
        const frIdx  = colIdx("family relation");

        if (snIdx === -1 || fidIdx === -1) {
          toast({ title: "File must have 'Serial No' and 'Family ID' columns", variant: "destructive" });
          return;
        }

        // Fetch current pilgrims to enrich preview
        let pilgrimMap: Map<number, { fullName: string; currentFamilyId: string | null }> = new Map();
        try {
          const r = await fetch(`${API}/api/groups/${groupId}/pilgrims`, { credentials: "include" });
          if (r.ok) {
            const list: any[] = await r.json();
            for (const p of list) {
              pilgrimMap.set(Number(p.serialNumber), {
                fullName: p.fullName,
                currentFamilyId: p.familyId || null,
              });
            }
          }
        } catch { /* preview degrades gracefully */ }

        const parsed: FamilyRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          const hasAnyValue = row.some((c: any) => String(c).trim() !== "");
          if (!hasAnyValue) continue;

          const sn = Number(String(row[snIdx] ?? "").trim());
          const familyId = String(row[fidIdx] ?? "").trim();
          const familyHead = String(row[fhIdx] ?? "").trim();
          const familyRelation = frIdx !== -1 ? String(row[frIdx] ?? "").trim() : "";

          let error: string | undefined;
          if (!sn || isNaN(sn)) error = "Invalid serial number";
          else if (!familyId) error = "Family ID is required";

          const pilgrim = sn && pilgrimMap.has(sn) ? pilgrimMap.get(sn)! : undefined;
          if (sn && !isNaN(sn) && !pilgrim && pilgrimMap.size > 0) {
            error = "Serial number not found in group";
          }

          parsed.push({
            rowIndex: i,
            serialNumber: isNaN(sn) ? null : sn,
            familyId,
            familyHead,
            familyRelation,
            fullName: pilgrim?.fullName,
            currentFamilyId: pilgrim?.currentFamilyId ?? undefined,
            error,
          });
        }

        setFamilyRows(parsed);
        if (parsed.length === 0) toast({ title: "No data rows found", variant: "destructive" });
      } catch {
        toast({ title: "Failed to parse file", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast, groupId]);

  const handleFamilyImport = async () => {
    const valid = familyRows.filter(r => !r.error);
    if (valid.length === 0) { toast({ title: "No valid rows to import", variant: "destructive" }); return; }
    setFamilyImporting(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/bulk-family`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: valid.map(r => ({
            serialNumber: r.serialNumber,
            familyId: r.familyId || null,
            familyHead: r.familyHead,
            familyRelation: r.familyRelation || null,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Import failed");
      const result = await res.json();
      setFamilyResult(result);
      toast({ title: `Updated ${result.updated} pilgrims${result.skipped ? `, ${result.skipped} skipped` : ""}` });
      onImported();
      // Clear file + parsed rows but keep familyResult visible so admin can see the summary
      setFamilyRows([]);
      if (familyRef.current) familyRef.current.value = "";
    } catch (err: any) {
      toast({ title: err.message || "Import failed", variant: "destructive" });
    } finally {
      setFamilyImporting(false);
    }
  };

  const handleExcelFile = useCallback((file: File) => {
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (raw.length < 2) {
          toast({ title: "Excel file appears empty", variant: "destructive" });
          setParsedRows([]);
          return;
        }

        const headers: string[] = raw[0].map((h: any) => String(h).trim().toLowerCase());
        const rows: ParsedRow[] = [];

        const groupPassports = new Set(existingPassports.map(p => p.toUpperCase().trim()));
        const batchPassports = new Set<string>();

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          const hasAnyValue = row.some((cell: any) => String(cell).trim() !== "");
          if (!hasAnyValue) continue;

          const data: Record<string, string> = {};
          headers.forEach((h, idx) => {
            const key = COLUMN_MAP[h];
            if (key) data[key] = String(row[idx] ?? "").trim();
          });

          let error: string | undefined;
          if (!data.fullName) {
            error = "Missing Full Name";
          } else if (data.passportNumber) {
            const pk = data.passportNumber.toUpperCase().trim();
            if (groupPassports.has(pk)) {
              error = "Passport already in group";
            } else if (batchPassports.has(pk)) {
              error = "Duplicate passport in file";
            } else {
              batchPassports.add(pk);
            }
          }

          rows.push({ index: i, data, error });
        }

        setParsedRows(rows);
        if (rows.length === 0) toast({ title: "No data rows found in file", variant: "destructive" });
      } catch {
        toast({ title: "Failed to parse Excel file", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast, existingPassports]);

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => !r.error);
    if (validRows.length === 0) { toast({ title: "No valid rows to import", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pilgrims: validRows.map(r => r.data) }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Import failed");
      const result: ImportResult = await res.json();
      setImportResult(result);
      toast({ title: `Imported ${result.created} pilgrims${result.skipped ? `, ${result.skipped} skipped` : ""}` });
      onImported();
      clearExcelFile();
    } catch (err: any) {
      toast({ title: err.message || "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handlePhotoUpload = async () => {
    if (!zipFile) return;
    setUploadingPhotos(true);
    try {
      const fd = new FormData();
      fd.append("photos", zipFile);
      const res = await fetch(`${API}/api/groups/${groupId}/pilgrims/bulk-photos`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      const result: PhotoResult = await res.json();
      setPhotoResult(result);
      toast({ title: `${result.matched} photos matched, ${result.unmatched} unmatched` });
      onImported();
    } catch (err: any) {
      toast({ title: err.message || "Photo upload failed", variant: "destructive" });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const validCount = parsedRows.filter(r => !r.error).length;
  const errorCount = parsedRows.filter(r => !!r.error).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Upload size={20} /> Bulk Import Pilgrims
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b mb-4">
          <button
            onClick={() => setTab("excel")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === "excel" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <FileSpreadsheet size={15} /> Excel Import
          </button>
          <button
            onClick={() => setTab("photos")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === "photos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <ImageIcon size={15} /> Bulk Photos
          </button>
          <button
            onClick={() => setTab("family")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${tab === "family" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Users size={15} /> Family IDs
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "excel" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Step 1: Download the template</p>
                  <p className="text-xs text-blue-700 mt-0.5">Fill in pilgrim data using the provided Excel template</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100" onClick={downloadTemplate}>
                  <Download size={14} /> Template
                </Button>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30">
                <p className="text-sm font-semibold mb-2">Step 2: Upload your filled Excel file</p>
                <div className="flex items-center gap-3">
                  <input ref={excelRef} type="file" accept=".xlsx" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleExcelFile(e.target.files[0]); }} />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => excelRef.current?.click()}>
                    <FileSpreadsheet size={14} /> Choose Excel File
                  </Button>
                  {parsedRows.length > 0 && (
                    <div className="flex gap-3 text-sm">
                      {validCount > 0 && <span className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> {validCount} valid</span>}
                      {errorCount > 0 && <span className="text-red-600 font-medium flex items-center gap-1"><XCircle size={13} /> {errorCount} errors</span>}
                    </div>
                  )}
                </div>
              </div>

              {parsedRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Step 3: Review and confirm</p>
                  <div className="border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="text-xs w-full">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                            <th className="text-left px-3 py-2 font-semibold">Full Name</th>
                            <th className="text-left px-3 py-2 font-semibold">Passport</th>
                            <th className="text-left px-3 py-2 font-semibold">Gender</th>
                            <th className="text-left px-3 py-2 font-semibold">Mobile India</th>
                            <th className="text-left px-3 py-2 font-semibold">Family ID</th>
                            <th className="text-left px-3 py-2 font-semibold">Head</th>
                            <th className="text-left px-3 py-2 font-semibold w-28">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.map((row, i) => (
                            <tr key={i} className={`border-t ${row.error ? "bg-red-50" : "hover:bg-muted/20"}`}>
                              <td className="px-3 py-1.5 text-muted-foreground">{row.index}</td>
                              <td className="px-3 py-1.5 font-medium">{row.data.fullName || <span className="text-red-500 italic">—</span>}</td>
                              <td className="px-3 py-1.5 font-mono">{row.data.passportNumber || "—"}</td>
                              <td className="px-3 py-1.5">{row.data.gender || "—"}</td>
                              <td className="px-3 py-1.5">{row.data.mobileIndia || "—"}</td>
                              <td className="px-3 py-1.5 font-mono text-amber-700">{row.data.familyId || "—"}</td>
                              <td className="px-3 py-1.5">{row.data.familyHead?.toLowerCase() === "yes" ? <CheckCircle2 size={12} className="text-emerald-600" /> : "—"}</td>
                              <td className="px-3 py-1.5">
                                {row.error
                                  ? <span className="flex items-center gap-1 text-red-600"><AlertCircle size={11} /> {row.error}</span>
                                  : <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> OK</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {importResult && (
                <div className="rounded-xl overflow-hidden border border-emerald-200">
                  <div className="p-3 bg-emerald-50 flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                    <span className="text-sm font-semibold text-emerald-800">
                      Import Complete — {importResult.created} added{importResult.skipped > 0 ? `, ${importResult.skipped} skipped` : ""}
                    </span>
                  </div>
                  {importResult.skippedRows && importResult.skippedRows.length > 0 && (
                    <div className="border-t border-emerald-100">
                      <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 bg-muted/30">Skipped rows</p>
                      <div className="max-h-36 overflow-y-auto">
                        {importResult.skippedRows.map((row: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs border-t bg-red-50">
                            <span className="font-medium truncate max-w-[200px]">{row.fullName || <em className="text-muted-foreground">No name</em>}</span>
                            <span className="text-red-600 flex items-center gap-1 shrink-0"><AlertCircle size={10} /> {row.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || validCount === 0}
                  className="flex-1 gap-1"
                >
                  {importing ? "Importing..." : `Import ${validCount > 0 ? validCount : ""} Pilgrims`}
                  {!importing && validCount > 0 && <ChevronRight size={15} />}
                </Button>
              </div>
            </div>
          )}

          {tab === "photos" && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-sm font-semibold text-amber-900 mb-1">How to prepare your photos</p>
                <ul className="text-xs text-amber-800 space-y-1 list-disc pl-4">
                  <li>Rename each photo file to the pilgrim's <strong>passport number</strong> (e.g. <code className="bg-amber-100 px-1 rounded">A1234567.jpg</code>)</li>
                  <li>Put all photos into a single ZIP file</li>
                  <li>Supported formats: JPG, PNG, WebP</li>
                  <li>Pilgrims must already be added to this group before uploading photos</li>
                </ul>
              </div>

              <div className="p-4 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30">
                <p className="text-sm font-semibold mb-2">Upload ZIP file</p>
                <div className="flex items-center gap-3">
                  <input ref={zipRef} type="file" accept=".zip" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) { setZipFile(e.target.files[0]); setPhotoResult(null); } }} />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => zipRef.current?.click()}>
                    <Upload size={14} /> Choose ZIP File
                  </Button>
                  {zipFile && <span className="text-sm text-muted-foreground truncate max-w-xs">{zipFile.name}</span>}
                </div>
              </div>

              {photoResult && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">Results</span>
                    <div className="flex gap-4 text-xs">
                      <span className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> {photoResult.matched} matched</span>
                      {photoResult.unmatched > 0 && <span className="text-red-600 font-medium flex items-center gap-1"><XCircle size={12} /> {photoResult.unmatched} unmatched</span>}
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {photoResult.results.map((r, i) => (
                      <div key={i} className={`flex items-center justify-between px-4 py-2 text-xs border-t ${r.status === "matched" ? "hover:bg-muted/20" : "bg-red-50"}`}>
                        <span className="font-mono">{r.filename}</span>
                        <span className={`flex items-center gap-1 ${r.status === "matched" ? "text-emerald-600" : "text-red-500"}`}>
                          {r.status === "matched"
                            ? <><CheckCircle2 size={11} /> Matched to {r.passportNumber}</>
                            : <><XCircle size={11} /> No pilgrim found</>
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
                <Button
                  onClick={handlePhotoUpload}
                  disabled={uploadingPhotos || !zipFile}
                  className="flex-1 gap-1"
                >
                  {uploadingPhotos ? "Uploading..." : "Upload Photos"}
                  {!uploadingPhotos && zipFile && <ChevronRight size={15} />}
                </Button>
              </div>
            </div>
          )}

          {tab === "family" && (() => {
            const validFamilyCount = familyRows.filter(r => !r.error).length;
            const errorFamilyCount = familyRows.filter(r => !!r.error).length;
            return (
              <div className="space-y-4">
                {/* Step 1: template */}
                <div className="flex items-center justify-between gap-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div>
                    <p className="text-sm font-semibold text-purple-900">Step 1: Download the template</p>
                    <p className="text-xs text-purple-700 mt-0.5">Fill in Serial No + Family ID for each pilgrim (other columns optional)</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 shrink-0 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={downloadFamilyTemplate}>
                    <Download size={14} /> Template
                  </Button>
                </div>

                {/* Step 2: upload */}
                <div className="p-4 bg-muted/30 rounded-xl border border-dashed border-muted-foreground/30">
                  <p className="text-sm font-semibold mb-2">Step 2: Upload your filled Excel file</p>
                  <div className="flex items-center gap-3">
                    <input ref={familyRef} type="file" accept=".xlsx,.csv" className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleFamilyFile(e.target.files[0]); }} />
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => familyRef.current?.click()}>
                      <FileSpreadsheet size={14} /> Choose Excel File
                    </Button>
                    {familyRows.length > 0 && (
                      <div className="flex gap-3 text-sm">
                        {validFamilyCount > 0 && <span className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 size={13} /> {validFamilyCount} valid</span>}
                        {errorFamilyCount > 0 && <span className="text-red-600 font-medium flex items-center gap-1"><XCircle size={13} /> {errorFamilyCount} errors</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: preview */}
                {familyRows.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Step 3: Review and confirm</p>
                    <div className="border rounded-xl overflow-hidden">
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="text-xs w-full">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold w-10">S.No</th>
                              <th className="text-left px-3 py-2 font-semibold">Name</th>
                              <th className="text-left px-3 py-2 font-semibold">Current Family ID</th>
                              <th className="text-left px-3 py-2 font-semibold">New Family ID</th>
                              <th className="text-left px-3 py-2 font-semibold w-14">Head</th>
                              <th className="text-left px-3 py-2 font-semibold w-32">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {familyRows.map((row, i) => (
                              <tr key={i} className={`border-t ${row.error ? "bg-red-50" : "hover:bg-muted/20"}`}>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.serialNumber ?? "?"}</td>
                                <td className="px-3 py-1.5 font-medium">{row.fullName || <span className="text-muted-foreground italic text-xs">unknown</span>}</td>
                                <td className="px-3 py-1.5 font-mono text-muted-foreground">{row.currentFamilyId || "—"}</td>
                                <td className="px-3 py-1.5 font-mono text-amber-700">{row.familyId || "—"}</td>
                                <td className="px-3 py-1.5">
                                  {row.familyHead?.toLowerCase() === "yes"
                                    ? <CheckCircle2 size={12} className="text-emerald-600" />
                                    : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-1.5">
                                  {row.error
                                    ? <span className="flex items-center gap-1 text-red-600"><AlertCircle size={11} /> {row.error}</span>
                                    : <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> OK</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Result */}
                {familyResult && (
                  <div className="rounded-xl overflow-hidden border border-emerald-200">
                    <div className="p-3 bg-emerald-50 flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                      <span className="text-sm font-semibold text-emerald-800">
                        Done — {familyResult.updated} pilgrims updated{familyResult.skipped > 0 ? `, ${familyResult.skipped} skipped` : ""}
                      </span>
                    </div>
                    {familyResult.skippedRows?.length > 0 && (
                      <div className="border-t border-emerald-100 max-h-36 overflow-y-auto">
                        {familyResult.skippedRows.map((row: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs border-t bg-red-50">
                            <span className="font-mono">Serial #{row.serialNumber}</span>
                            <span className="text-red-600 flex items-center gap-1"><AlertCircle size={10} /> {row.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={handleClose} className="flex-1">Close</Button>
                  <Button
                    onClick={handleFamilyImport}
                    disabled={familyImporting || validFamilyCount === 0}
                    className="flex-1 gap-1"
                  >
                    {familyImporting ? "Updating..." : `Update ${validFamilyCount > 0 ? validFamilyCount : ""} Pilgrims`}
                    {!familyImporting && validFamilyCount > 0 && <ChevronRight size={15} />}
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
