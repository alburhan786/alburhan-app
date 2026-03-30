import { useState, useRef, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { CheckCircle, Upload, User, FileText, ShieldCheck, AlertCircle } from "lucide-react";

const BASE_API = import.meta.env.VITE_API_URL || "";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

interface KYCProfile {
  id?: string;
  name?: string;
  phone?: string;
  whatsappNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportPlaceOfIssue?: string;
  passportImageUrl?: string;
  photoUrl?: string;
  bloodGroup?: string;
  aadharNumber?: string;
  aadharImageUrl?: string;
  panNumber?: string;
  panImageUrl?: string;
  healthCertificateUrl?: string;
  kycStatus?: string;
}

function FileUploadField({
  label,
  name,
  currentUrl,
  required,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
}: {
  label: string;
  name: string;
  currentUrl?: string;
  required?: boolean;
  accept?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setPreview(URL.createObjectURL(file));
    } else {
      setPreview(null);
    }
  };

  const displayUrl = preview || (currentUrl ? `${BASE_API}${currentUrl}` : null);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {displayUrl && displayUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
        <div className="relative mb-2">
          <img src={displayUrl} alt={label} className="h-24 rounded-lg object-cover border" />
        </div>
      ) : currentUrl ? (
        <a href={`${BASE_API}${currentUrl}`} target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary underline block mb-1">View current file</a>
      ) : null}
      <div
        className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={18} className="mx-auto mb-1 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Click to upload {currentUrl ? "(replace)" : ""}</p>
        <input ref={inputRef} type="file" name={name} accept={accept} className="hidden" onChange={handleChange} />
      </div>
    </div>
  );
}

export default function KYCPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<KYCProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate("/login");
      return;
    }
    fetch(`${BASE_API}/api/kyc/profile`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setProfile(data); setLoadingProfile(false); })
      .catch(() => setLoadingProfile(false));
  }, [isAuthenticated, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);

    const passportExpiry = formData.get("passportExpiryDate") as string;
    if (passportExpiry && new Date(passportExpiry) <= new Date()) {
      toast({ title: "Invalid passport", description: "Passport expiry date must be in the future.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const url = profile?.id ? `${BASE_API}/api/kyc/update` : `${BASE_API}/api/kyc/submit`;
      const method = profile?.id ? "PUT" : "POST";
      const res = await fetch(url, { method, body: formData, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");
      setProfile(data);
      toast({ title: "KYC submitted successfully!", description: "Our team will review your documents." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || loadingProfile) {
    return (
      <MainLayout>
        <div className="py-20 text-center text-muted-foreground">Loading...</div>
      </MainLayout>
    );
  }

  const statusColor: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="text-primary" size={28} />
            <h1 className="text-3xl font-serif font-bold text-foreground">Complete Your KYC</h1>
          </div>
          <p className="text-muted-foreground">Submit your identity documents for verification. This is required before your pilgrimage.</p>
          {profile?.kycStatus && (
            <div className="mt-3 inline-flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusColor[profile.kycStatus] || "bg-muted text-foreground"}`}>
                KYC Status: {profile.kycStatus.charAt(0).toUpperCase() + profile.kycStatus.slice(1)}
              </span>
            </div>
          )}
          {profile?.kycStatus === "approved" && (
            <div className="mt-3 flex items-center gap-2 text-emerald-700 text-sm font-medium">
              <CheckCircle size={16} /> Your KYC is verified. You may update documents if needed.
            </div>
          )}
          {profile?.kycStatus === "rejected" && (
            <div className="mt-3 flex items-center gap-2 text-red-700 text-sm font-medium">
              <AlertCircle size={16} /> KYC was rejected. Please resubmit with correct documents.
            </div>
          )}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} encType="multipart/form-data">
          <div className="space-y-6">
            <Card className="p-6 border-none shadow-sm rounded-2xl">
              <h2 className="text-base font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} /> Personal Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></label>
                  <Input name="name" required defaultValue={profile?.name || ""} placeholder="As on passport" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Phone Number <span className="text-red-500">*</span></label>
                  <Input name="phone" required defaultValue={profile?.phone || user?.mobile || ""} placeholder="10-digit mobile" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">WhatsApp Number</label>
                  <Input name="whatsappNumber" defaultValue={profile?.whatsappNumber || ""} placeholder="WhatsApp number" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date of Birth <span className="text-red-500">*</span></label>
                  <Input type="date" name="dateOfBirth" required defaultValue={profile?.dateOfBirth || ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gender <span className="text-red-500">*</span></label>
                  <select name="gender" required defaultValue={profile?.gender || ""} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Blood Group</label>
                  <select name="bloodGroup" defaultValue={profile?.bloodGroup || "unknown"} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                    {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g === "unknown" ? "Not Known" : g}</option>)}
                  </select>
                </div>
                <div className="col-span-1 sm:col-span-2 space-y-2">
                  <label className="text-sm font-medium">Full Address <span className="text-red-500">*</span></label>
                  <textarea name="address" required defaultValue={profile?.address || ""} rows={2}
                    className="w-full p-3 rounded-md border text-sm min-h-[60px]" placeholder="House No., Street, City, State, PIN" />
                </div>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-sm rounded-2xl">
              <h2 className="text-base font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText size={16} /> Passport Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Passport Number <span className="text-red-500">*</span></label>
                  <Input name="passportNumber" required defaultValue={profile?.passportNumber || ""} placeholder="e.g. A1234567" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Place of Issue <span className="text-red-500">*</span></label>
                  <Input name="passportPlaceOfIssue" required defaultValue={profile?.passportPlaceOfIssue || ""} placeholder="e.g. Mumbai" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Issue Date <span className="text-red-500">*</span></label>
                  <Input type="date" name="passportIssueDate" required defaultValue={profile?.passportIssueDate || ""} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Expiry Date <span className="text-red-500">*</span></label>
                  <Input type="date" name="passportExpiryDate" required defaultValue={profile?.passportExpiryDate || ""} />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <FileUploadField label="Passport Copy" name="passportImage" currentUrl={profile?.passportImageUrl} required accept="image/jpeg,image/png,image/webp,application/pdf" />
                </div>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-sm rounded-2xl">
              <h2 className="text-base font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                <Upload size={16} /> Upload Documents
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <FileUploadField label="Profile Photo" name="photo" currentUrl={profile?.photoUrl} required accept="image/jpeg,image/png,image/webp" />
                <FileUploadField label="Aadhaar Card" name="aadharImage" currentUrl={profile?.aadharImageUrl} accept="image/jpeg,image/png,image/webp,application/pdf" />
                <FileUploadField label="PAN Card" name="panImage" currentUrl={profile?.panImageUrl} accept="image/jpeg,image/png,image/webp,application/pdf" />
                <FileUploadField label="Health Certificate" name="healthCertificate" currentUrl={profile?.healthCertificateUrl} accept="image/jpeg,image/png,image/webp,application/pdf" />
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Aadhaar Number</label>
                  <Input name="aadharNumber" defaultValue={profile?.aadharNumber || ""} placeholder="12-digit Aadhaar" maxLength={12} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">PAN Number</label>
                  <Input name="panNumber" defaultValue={profile?.panNumber || ""} placeholder="e.g. ABCDE1234F" maxLength={10} />
                </div>
              </div>
            </Card>

            <Button type="submit" disabled={submitting} className="w-full h-12 text-base rounded-xl bg-primary text-white font-semibold">
              {submitting ? "Submitting..." : profile?.id ? "Update KYC" : "Submit KYC"}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}
