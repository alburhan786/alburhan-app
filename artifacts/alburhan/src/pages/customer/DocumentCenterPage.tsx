/**
 * DocumentCenterPage (Portal 2.0) — enhanced version that accepts ?bookingNumber=
 * and lives at /customer/booking/:bookingNumber/documents
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { CustomerPortalLayout } from "@/components/layout/CustomerPortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  BookOpen, Upload, Download, Eye, Trash2, FileText,
  Image, File, AlertCircle, CheckCircle
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const DOC_TYPES = [
  { value: "passport",            label: "Passport" },
  { value: "aadhaar",             label: "Aadhaar Card" },
  { value: "pan_card",            label: "PAN Card" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "passport_photo",      label: "Passport Photo" },
  { value: "visa",                label: "Visa Document" },
  { value: "other",               label: "Other" },
];

const MANDATORY = ["passport_photo", "passport", "pan_card", "aadhaar"];

function fileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return <Image size={18} className="text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText size={18} className="text-red-500" />;
  return <File size={18} className="text-slate-400" />;
}

function groupDocs(docs: any[]) {
  const travel: any[] = [], official: any[] = [], other: any[] = [];
  docs.forEach(d => {
    if (["passport", "passport_photo"].includes(d.document_type)) travel.push(d);
    else if (["pan_card", "aadhaar", "visa"].includes(d.document_type)) official.push(d);
    else other.push(d);
  });
  return { travel, official, other };
}

export default function DocumentCenterPage() {
  const [, params] = useRoute("/customer/booking/:bookingNumber/documents");
  const bookingNumber = params?.bookingNumber;
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bookingId, setBookingId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docType, setDocType] = useState("passport");
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    if (!bookingNumber) return;
    setLoading(true);
    try {
      const bkRes = await fetch(`${API}/api/customer/bookings/${bookingNumber}`, { credentials: "include" });
      if (bkRes.ok) {
        const bd = await bkRes.json();
        if (bd.booking?.id) {
          setBookingId(bd.booking.id);
          const docRes = await fetch(`${API}/api/documents/${bd.booking.id}`, { credentials: "include" });
          // List endpoint returns camelCase via normalizeDoc
          if (docRes.ok) {
            const dd = await docRes.json();
            setDocs(Array.isArray(dd) ? dd : dd.documents || []);
          }
        }
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [bookingNumber]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !bookingId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // API expects camelCase field names
      fd.append("documentType", docType);
      fd.append("bookingId", bookingId);
      const r = await fetch(`${API}/api/documents/upload`, { method: "POST", credentials: "include", body: fd });
      if (r.ok) {
        toast({ title: "Document uploaded successfully" });
        setUploadOpen(false);
        load();
      } else {
        const err = await r.json().catch(() => ({}));
        toast({ title: "Upload failed", description: err.error || "Please try again", variant: "destructive" });
      }
    } finally { setUploading(false); }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this document?")) return;
    setDeleting(id);
    try {
      const r = await fetch(`${API}/api/documents/${id}`, { method: "DELETE", credentials: "include" });
      if (r.ok) { setDocs(ds => ds.filter(d => d.id !== id)); toast({ title: "Document deleted" }); }
    } finally { setDeleting(null); }
  }

  const { travel, official, other } = groupDocs(docs);
  // API list endpoint returns camelCase via normalizeDoc
  const uploadedTypes = new Set(docs.map(d => d.documentType));
  const pendingMandatory = MANDATORY.filter(t => !uploadedTypes.has(t));

  const DocList = ({ items, label }: { items: any[]; label: string }) => (
    items.length > 0 ? (
      <div className="mb-5">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</h4>
        <div className="space-y-2">
          {items.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50">
              {fileIcon(d.mimeType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {DOC_TYPES.find(t => t.value === d.documentType)?.label || d.documentType}
                </p>
                <p className="text-xs text-slate-400">
                  {d.originalFilename || d.fileName || "file"} · {formatDate(d.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {d.id && (
                  <a href={`${API}/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded transition-colors"
                    title="View">
                    <Eye size={15} />
                  </a>
                )}
                {d.id && (
                  <a href={`${API}/api/documents/${d.id}/download`} download
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded transition-colors"
                    title="Download">
                    <Download size={15} />
                  </a>
                )}
                <button onClick={() => deleteDoc(d.id)} disabled={deleting === d.id}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <CustomerPortalLayout title="Documents" bookingNumber={bookingNumber}>
      <div className="space-y-5">
        {/* Mandatory checklist */}
        {pendingMandatory.length > 0 && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Missing required documents</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {pendingMandatory.map(t => DOC_TYPES.find(d => d.value === t)?.label).join(", ")}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
          <Button onClick={() => setUploadOpen(true)} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-sm">
            <Upload size={15} className="mr-1.5" />Upload
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : docs.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2">
            <BookOpen size={36} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium">No documents uploaded yet</p>
            <p className="text-xs text-slate-400 mt-1">Upload your passport, Aadhaar, and other required documents.</p>
            <Button onClick={() => setUploadOpen(true)} size="sm"
              className="mt-4 h-8 bg-emerald-600 hover:bg-emerald-700 text-xs">
              <Upload size={13} className="mr-1" />Upload document
            </Button>
          </Card>
        ) : (
          <Card className="p-5">
            <DocList items={travel} label="Travel Documents" />
            <DocList items={official} label="Official Documents" />
            <DocList items={other} label="Other Documents" />
          </Card>
        )}

        {/* Mandatory checklist */}
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Required Documents Checklist</h3>
          <div className="space-y-1.5">
            {MANDATORY.map(t => (
              <div key={t} className="flex items-center gap-2">
                {uploadedTypes.has(t)
                  ? <CheckCircle size={15} className="text-green-500" />
                  : <AlertCircle size={15} className="text-amber-400" />}
                <span className={`text-sm ${uploadedTypes.has(t) ? "text-slate-500 line-through" : "text-slate-800"}`}>
                  {DOC_TYPES.find(d => d.value === t)?.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">File</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-9 text-sm" />
              <p className="text-xs text-slate-400 mt-1">PDF, JPG, or PNG · Max 10MB</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={upload} disabled={uploading}
                className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-sm">
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <Button variant="outline" onClick={() => setUploadOpen(false)} className="h-9 text-sm">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </CustomerPortalLayout>
  );
}
