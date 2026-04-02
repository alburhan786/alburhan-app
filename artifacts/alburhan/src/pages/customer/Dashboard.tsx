import React, { useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { useListBookings, useListDocuments, useDeleteDocument } from "@workspace/api-client-react";
import { usePayment } from "@/hooks/use-payment";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CreditCard, FileText, Download, Clock, Upload, Trash2, CheckCircle, AlertCircle, X, Eye, ShieldAlert, IndianRupee, Plane, Stamp, Hotel, Bus, Printer, Share2, Copy, Bell, BellRing, CheckCheck, Megaphone, ClipboardList, MessageSquare, Send, User, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef } from "react";
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

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function TravelDetailsCard({ bookingId, initialStatus }: { bookingId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [showForm, setShowForm] = useState(initialStatus === "not_submitted");
  const [loadingProfile, setLoadingProfile] = useState(initialStatus === "not_submitted");
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "", dateOfBirth: "", gender: "", mobileIndia: "", bloodGroup: "",
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
            mobileIndia: data.profile.phone || "",
            bloodGroup: data.profile.bloodGroup || "",
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
    if (initialStatus === "not_submitted") {
      loadProfile();
    }
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

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mobile (India)</label>
              <input className={inputCls} type="tel" placeholder="10-digit number" value={form.mobileIndia} onChange={e => setForm(f => ({ ...f, mobileIndia: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blood Group</label>
              <select className={inputCls} value={form.bloodGroup} onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value }))}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
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
  flight_ticket:  { label: "Flight Ticket",          icon: Plane,          color: "text-sky-700",     bg: "bg-sky-50 border-sky-200" },
  visa:           { label: "Visa",                   icon: Stamp,          color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  room_allotment: { label: "Hotel / Room Allotment", icon: Hotel,          color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  bus_allotment:  { label: "Bus Allotment",          icon: Bus,            color: "text-orange-700",  bg: "bg-orange-50 border-orange-200" },
  model_contract: { label: "Model Contract",         icon: FileText,       color: "text-rose-700",    bg: "bg-rose-50 border-rose-200" },
  tour_itinerary: { label: "Tour Itinerary",         icon: ClipboardList,  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
};

function TravelDocumentsCard({ bookingId }: { bookingId: string }) {
  const BASE_API = import.meta.env.VITE_API_URL || "";
  const { toast } = useToast();
  const { data: docs } = useListDocuments(bookingId, { query: { refetchOnMount: "always" } });
  const allDocs = (docs || []) as any[];
  const travelDocs = allDocs.filter((d: any) => d.uploadedBy === "admin" && TRAVEL_DOC_TYPES[d.documentType]);

  const slots = Object.keys(TRAVEL_DOC_TYPES);

  function handlePrint(url: string) {
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        win.focus();
        win.print();
      });
    }
  }

  async function handleShare(url: string, fileName: string) {
    const fullUrl = `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: fileName, url: fullUrl });
      } catch (_) {}
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
    <Card className="overflow-hidden rounded-2xl shadow-md border-2 border-primary/20">
      <div className="px-5 py-4 flex items-center gap-3 bg-primary/5 border-b border-primary/15">
        <Plane className="w-5 h-5 text-primary shrink-0" />
        <div>
          <h4 className="font-bold text-sm text-primary">Your Travel Documents</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Uploaded by Al Burhan Tours — visible once ready</p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {slots.map(type => {
          const meta = TRAVEL_DOC_TYPES[type];
          const Icon = meta.icon;
          const uploaded = travelDocs.filter((d: any) => d.documentType === type);
          if (uploaded.length === 0) {
            return (
              <div key={type} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border bg-muted/20">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{meta.label}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">Will appear once ready</p>
                </div>
              </div>
            );
          }
          return uploaded.map((doc: any) => {
            const fileUrl = `${BASE_API}${doc.fileUrl}`;
            const isPdf = doc.fileName?.toLowerCase().endsWith(".pdf");
            return (
              <div key={doc.id} className={`rounded-xl border ${meta.bg} overflow-hidden`}>
                <div className={`flex items-center gap-3 p-3`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/50`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{doc.fileName}</p>
                  </div>
                </div>
                <div className={`grid grid-cols-4 border-t border-black/5 divide-x divide-black/5`}>
                  <a href={fileUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors">
                    <Eye size={15} className={meta.color} />
                    <span className="text-[10px] font-medium text-muted-foreground">View</span>
                  </a>
                  <a href={fileUrl} download={doc.fileName} className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors">
                    <Download size={15} className={meta.color} />
                    <span className="text-[10px] font-medium text-muted-foreground">Download</span>
                  </a>
                  {isPdf && (
                    <button onClick={() => handlePrint(fileUrl)} className="flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full">
                      <Printer size={15} className={meta.color} />
                      <span className="text-[10px] font-medium text-muted-foreground">Print</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleShare(doc.fileUrl, doc.fileName)}
                    className={`flex flex-col items-center gap-1 py-2 hover:bg-black/5 transition-colors w-full ${!isPdf ? "col-span-2" : ""}`}
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

const NOTIF_TYPE_EMOJI: Record<string, string> = {
  mina_update: "🕌", tawaf_update: "🕋", madinah_update: "🟢",
  flight_update: "✈️", bus_update: "🚌", food_update: "🍽️",
  ziyarat_update: "🗺️", general: "📢",
};

interface CustomerNotification {
  id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string;
}

function NotificationsPanel({
  notifications, onClose, onMarkRead, onMarkAllRead,
}: {
  notifications: CustomerNotification[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  const unread = notifications.filter(n => !n.isRead).length;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border bg-primary text-white">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5" />
            <span className="font-bold text-base">Notifications</span>
            {unread > 0 && <span className="bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full">{unread}</span>}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button onClick={onMarkAllRead} className="text-xs text-white/70 hover:text-white flex items-center gap-1">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Bell className="w-10 h-10 opacity-20" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-4 cursor-pointer transition-colors hover:bg-muted/30 ${!n.isRead ? "bg-primary/5 border-l-4 border-l-primary" : ""}`}
                  onClick={() => !n.isRead && onMarkRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0 mt-0.5">{NOTIF_TYPE_EMOJI[n.type] || "📢"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${!n.isRead ? "text-primary" : "text-foreground"}`}>{n.title}</p>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-2">{formatDate(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border p-3 bg-muted/30">
          <p className="text-[11px] text-center text-muted-foreground">Messages from Al Burhan Tours & Travels</p>
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

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = React.useRef(0);

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

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_API}/api/notifications/my`, { credentials: "include" });
      if (!res.ok) return;
      setNotifications(await res.json());
    } catch {}
  }, []);

  const handleOpenNotifications = () => {
    setShowNotifications(true);
    loadNotifications();
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

  const uploadBooking = bookings.find((b: any) => b.id === uploadBookingId);

  const handleDownloadInvoice = async (bookingId: string) => {
    try {
      const res = await fetch(`${BASE_API}/api/bookings/${bookingId}/invoice`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const inv = await res.json();
      const invoiceHtml = `
        <html><head><title>Invoice ${inv.invoiceNumber}</title>
        <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1a1a1a}
        .header{text-align:center;border-bottom:3px solid #1a4a2e;padding-bottom:20px;margin-bottom:24px}
        .logo{font-size:24px;font-weight:bold;color:#1a4a2e}.subtitle{color:#888;font-size:13px}
        .invoice-num{background:#1a4a2e;color:white;padding:8px 20px;border-radius:6px;display:inline-block;margin-top:10px}
        table{width:100%;border-collapse:collapse;margin:16px 0}
        td{padding:10px 8px;border-bottom:1px solid #eee;font-size:14px}
        td:first-child{color:#666;width:45%} .total{font-size:18px;font-weight:bold;color:#1a4a2e}
        .footer{text-align:center;margin-top:30px;color:#888;font-size:12px;border-top:1px solid #eee;padding-top:16px}</style></head>
        <body>
        <div class="header">
          <div class="logo">Al Burhan Tours & Travels</div>
          <div class="subtitle">${inv.companyAddress} | ${inv.companyPhone}</div>
          <div class="invoice-num">Invoice #${inv.invoiceNumber}</div>
        </div>
        <table>
          <tr><td>Booking Number</td><td><strong>${inv.bookingNumber}</strong></td></tr>
          <tr><td>Customer Name</td><td>${inv.customerName}</td></tr>
          <tr><td>Mobile</td><td>${inv.customerMobile}</td></tr>
          <tr><td>Package</td><td>${inv.packageName}</td></tr>
          <tr><td>Number of Pilgrims</td><td>${inv.numberOfPilgrims}</td></tr>
          <tr><td>Departure Date</td><td>${inv.departureDate ? new Date(inv.departureDate).toLocaleDateString('en-IN') : '-'}</td></tr>
          <tr><td>Base Amount</td><td>₹${Number(inv.totalAmount).toLocaleString('en-IN')}</td></tr>
          <tr><td>GST (5%)</td><td>₹${Number(inv.gstAmount).toLocaleString('en-IN')}</td></tr>
          <tr><td class="total">Total Amount</td><td class="total">₹${Number(inv.finalAmount).toLocaleString('en-IN')}</td></tr>
        </table>
        <div class="footer">Thank you for choosing Al Burhan Tours & Travels. Jazak Allah Khair!<br/>${inv.companyEmail}</div>
        </body></html>
      `;
      const blob = new Blob([invoiceHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice_${inv.invoiceNumber}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Error", description: "Could not download invoice", variant: "destructive" });
    }
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
            <Card className="p-6 shadow-lg border-border/50 rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl font-bold text-primary">{(user?.name || user?.mobile || "?")[0].toUpperCase()}</span>
              </div>
              <h3 className="font-bold text-lg mb-4 text-center">My Profile</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wide">Name</span><span className="font-medium">{user?.name || <span className="text-muted-foreground italic">Not set</span>}</span></div>
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wide">Mobile</span><span className="font-medium">+91 {user?.mobile}</span></div>
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wide">Email</span><span className="font-medium">{user?.email || <span className="text-muted-foreground italic">Not set</span>}</span></div>
              </div>
            </Card>

            <Card className="p-5 shadow-sm border-border/50 rounded-2xl bg-accent/10">
              <h4 className="font-semibold text-sm text-primary mb-3">Need Help?</h4>
              <p className="text-xs text-muted-foreground mb-3">Our team is here to assist you with your booking.</p>
              <a href="https://wa.me/918989701701" target="_blank" rel="noreferrer">
                <Button size="sm" className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white text-xs">
                  WhatsApp Us
                </Button>
              </a>
              <p className="text-xs text-center text-muted-foreground mt-2">+91 8989701701</p>
            </Card>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3 space-y-8">
            <MyRequestsSection />

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
                      </div>
                      <div className="flex items-center gap-2">
                        {booking.status === 'confirmed' && <DocWarningBadge bookingId={booking.id} />}
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
                        <TravelDetailsCard bookingId={booking.id} initialStatus={(booking as any).travellerDetailsStatus || "not_submitted"} />
                        <MandatoryDocumentsCard bookingId={booking.id} onOpenUpload={() => setUploadBookingId(booking.id)} />
                        <TravelDocumentsCard bookingId={booking.id} />
                      </div>
                    )}

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

                      {booking.status === 'confirmed' && (
                        <Button
                          variant="outline"
                          onClick={() => handleDownloadInvoice(booking.id)}
                          className="border-primary text-primary hover:bg-primary/5"
                        >
                          <Download className="w-4 h-4 mr-2" /> Download Invoice
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
