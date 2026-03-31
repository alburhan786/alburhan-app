import { useState, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListPackages, useCreatePackage, useUpdatePackage, useDeletePackage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Star, Images, Upload, Video, X, MapPin, Tent, Hotel, Settings, Info, Plane, Navigation } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";

const BASE_API = import.meta.env.VITE_API_URL || "";

type FormTab = "basic" | "travel" | "hotels" | "meena" | "location" | "settings";

const TABS: { id: FormTab; label: string; icon: React.ReactNode }[] = [
  { id: "basic",    label: "Basic Info",   icon: <Info size={13} /> },
  { id: "travel",   label: "Travel",       icon: <Plane size={13} /> },
  { id: "hotels",   label: "Hotels",       icon: <Hotel size={13} /> },
  { id: "meena",    label: "Meena Tent",   icon: <Tent size={13} /> },
  { id: "location", label: "Location",     icon: <Navigation size={13} /> },
  { id: "settings", label: "Settings",     icon: <Settings size={13} /> },
];

export default function PackagesManager() {
  const { data: packages = [], isLoading } = useListPackages();
  const createMutation = useCreatePackage();
  const updateMutation = useUpdatePackage();
  const deleteMutation = useDeletePackage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingPkgData, setEditingPkgData] = useState<any>(null);
  const [formTab, setFormTab] = useState<FormTab>("basic");

  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaPkg, setMediaPkg] = useState<any>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [meenaUploading, setMeenaUploading] = useState(false);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);
  const meenaImgRef = useRef<HTMLInputElement>(null);
  const meenaVidRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const editCoverRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, watch } = useForm();
  const createImageUrl = watch("imageUrl") as string | undefined;
  const editForm = useForm();
  const editImageUrl = editForm.watch("imageUrl") as string | undefined;

  const handleEditClick = (pkg: any) => {
    setEditingPackageId(pkg.id);
    setEditingPkgData(pkg);
    const details = pkg.details || {};
    editForm.reset({
      name: pkg.name || "",
      type: pkg.type || "umrah",
      pricePerPerson: pkg.pricePerPerson || "",
      duration: pkg.duration || "",
      description: pkg.description || "",
      includes: Array.isArray(pkg.includes) ? pkg.includes.join(", ") : (pkg.includes || ""),
      highlights: Array.isArray(pkg.highlights) ? pkg.highlights.join(", ") : (pkg.highlights || ""),
      departureDates: Array.isArray(pkg.departureDates) ? pkg.departureDates.join(", ") : (pkg.departureDates || ""),
      imageUrl: pkg.imageUrl || "",
      isActive: pkg.isActive ? "true" : "false",
      featured: pkg.featured ? "true" : "false",
      gstPercent: pkg.gstPercent || 5,
      airline: details.airline || "",
      departureCities: Array.isArray(details.departureCities) ? details.departureCities.join(", ") : "",
      returnDate: details.returnDate || "",
      hotelMakkah: details.hotelMakkah || "",
      hotelMadinah: details.hotelMadinah || "",
      hotelCategoryMakkah: details.hotelCategoryMakkah || "",
      hotelCategoryMadinah: details.hotelCategoryMadinah || "",
      distanceMakkah: details.distanceMakkah || "",
      distanceMadinah: details.distanceMadinah || "",
      locationMakkah: details.locationMakkah || "",
      locationMadinah: details.locationMadinah || "",
      roomType: details.roomType || "",
      mealPlan: details.mealPlan || "",
      transport: details.transport || "",
      visa: details.visa || "",
      meenaTentLocation: details.meenaTentLocation || "",
      meenaTentCategory: details.meenaTentCategory || "",
      meenaTentZone: details.meenaTentZone || "",
      googleMapsMakkah: details.googleMapsMakkah || "",
      googleMapsMapMadinah: details.googleMapsMapMadinah || "",
      googleMapsMeena: details.googleMapsMeena || "",
    });
    setFormTab("basic");
    setIsEditOpen(true);
  };

  function buildPayload(data: any) {
    const details: any = {};
    if (data.airline) details.airline = data.airline;
    if (data.departureCities) details.departureCities = data.departureCities.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (data.returnDate) details.returnDate = data.returnDate;
    if (data.hotelMakkah) details.hotelMakkah = data.hotelMakkah;
    if (data.hotelMadinah) details.hotelMadinah = data.hotelMadinah;
    if (data.hotelCategoryMakkah) details.hotelCategoryMakkah = data.hotelCategoryMakkah;
    if (data.hotelCategoryMadinah) details.hotelCategoryMadinah = data.hotelCategoryMadinah;
    if (data.distanceMakkah) details.distanceMakkah = data.distanceMakkah;
    if (data.distanceMadinah) details.distanceMadinah = data.distanceMadinah;
    if (data.locationMakkah) details.locationMakkah = data.locationMakkah;
    if (data.locationMadinah) details.locationMadinah = data.locationMadinah;
    if (data.roomType) details.roomType = data.roomType;
    if (data.mealPlan) details.mealPlan = data.mealPlan;
    if (data.transport) details.transport = data.transport;
    if (data.visa) details.visa = data.visa;
    if (data.meenaTentLocation) details.meenaTentLocation = data.meenaTentLocation;
    if (data.meenaTentCategory) details.meenaTentCategory = data.meenaTentCategory;
    if (data.meenaTentZone) details.meenaTentZone = data.meenaTentZone;
    if (data.googleMapsMakkah) details.googleMapsMakkah = data.googleMapsMakkah;
    if (data.googleMapsMapMadinah) details.googleMapsMapMadinah = data.googleMapsMapMadinah;
    if (data.googleMapsMeena) details.googleMapsMeena = data.googleMapsMeena;
    return {
      name: data.name,
      type: data.type,
      description: data.description || undefined,
      duration: data.duration || undefined,
      pricePerPerson: Number(data.pricePerPerson),
      gstPercent: Number(data.gstPercent) || 5,
      includes: data.includes ? data.includes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      highlights: data.highlights ? data.highlights.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      departureDates: data.departureDates ? data.departureDates.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      details: Object.keys(details).length > 0 ? details : undefined,
      imageUrl: data.imageUrl || undefined,
      featured: data.featured === 'true',
      isActive: data.isActive === 'true',
    };
  }

  const onSubmit = async (data: any) => {
    try {
      await createMutation.mutateAsync({ data: buildPayload(data) });
      toast({ title: "Package created successfully" });
      setIsCreateOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const onEditSubmit = async (data: any) => {
    if (!editingPackageId) return;
    try {
      await updateMutation.mutateAsync({ id: editingPackageId, data: buildPayload(data) });
      toast({ title: "Package updated successfully" });
      setIsEditOpen(false);
      setEditingPackageId(null);
      setEditingPkgData(null);
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this package?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast({ title: "Package deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openMedia = (pkg: any) => {
    setMediaPkg({ ...pkg, imageUrls: pkg.imageUrls || [], videoUrls: pkg.videoUrls || [] });
    setMediaOpen(true);
  };

  const uploadMedia = async (file: File, type: "image" | "video") => {
    if (!mediaPkg) return;
    setMediaUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE_API}/api/packages/${mediaPkg.id}/upload-${type}`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMediaPkg((prev: any) => ({
        ...prev,
        imageUrls: type === "image" ? data.imageUrls : prev.imageUrls,
        videoUrls: type === "video" ? data.videoUrls : prev.videoUrls,
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: `${type === "image" ? "Photo" : "Video"} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setMediaUploading(false); }
  };

  const removeMedia = async (url: string, type: "image" | "video") => {
    if (!mediaPkg || !confirm(`Remove this ${type}?`)) return;
    try {
      const res = await fetch(`${BASE_API}/api/packages/${mediaPkg.id}/remove-${type}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMediaPkg((prev: any) => ({
        ...prev,
        imageUrls: type === "image" ? data.imageUrls : prev.imageUrls,
        videoUrls: type === "video" ? data.videoUrls : prev.videoUrls,
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: `${type === "image" ? "Photo" : "Video"} removed` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const uploadCover = async (file: File) => {
    if (!mediaPkg) return;
    setMediaUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE_API}/api/packages/${mediaPkg.id}/upload-cover`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMediaPkg((prev: any) => ({ ...prev, imageUrl: data.imageUrl }));
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: "Cover photo updated" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setMediaUploading(false); }
  };

  const uploadEditCover = async (file: File) => {
    if (!editingPackageId) return;
    setMediaUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE_API}/api/packages/${editingPackageId}/upload-cover`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      editForm.setValue("imageUrl", data.imageUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: "Cover photo uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setMediaUploading(false); }
  };

  const uploadMeena = async (file: File, type: "image" | "video") => {
    if (!editingPackageId) return;
    setMeenaUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE_API}/api/packages/${editingPackageId}/upload-meena-${type}`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEditingPkgData((prev: any) => ({
        ...prev,
        details: {
          ...(prev?.details || {}),
          meenaTentImageUrls: type === "image" ? data.meenaTentImageUrls : prev?.details?.meenaTentImageUrls,
          meenaTentVideoUrls: type === "video" ? data.meenaTentVideoUrls : prev?.details?.meenaTentVideoUrls,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: `Meena Tent ${type === "image" ? "photo" : "video"} uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally { setMeenaUploading(false); }
  };

  const removeMeena = async (url: string, type: "image" | "video") => {
    if (!editingPackageId || !confirm(`Remove this ${type}?`)) return;
    try {
      const res = await fetch(`${BASE_API}/api/packages/${editingPackageId}/remove-meena-${type}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEditingPkgData((prev: any) => ({
        ...prev,
        details: {
          ...(prev?.details || {}),
          meenaTentImageUrls: type === "image" ? data.meenaTentImageUrls : prev?.details?.meenaTentImageUrls,
          meenaTentVideoUrls: type === "video" ? data.meenaTentVideoUrls : prev?.details?.meenaTentVideoUrls,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
      toast({ title: `Meena Tent ${type === "image" ? "photo" : "video"} removed` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const FormTabs = ({ reg, isEdit, watchedImageUrl, onUpload, uploadRef }: {
    reg: any; isEdit: boolean; watchedImageUrl?: string; onUpload?: (f: File) => void; uploadRef?: { current: HTMLInputElement | null };
  }) => {
    const imgSrc = watchedImageUrl
      ? (watchedImageUrl.startsWith("/") ? `${BASE_API}${watchedImageUrl}` : watchedImageUrl)
      : null;
    return (
    <div className="space-y-0">
      {/* Tab bar */}
      <div className="flex gap-0.5 border-b mb-5 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setFormTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${formTab === t.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Basic Info */}
      {formTab === "basic" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Package Name *</label>
            <Input {...reg("name", { required: true })} placeholder="e.g. Premium Umrah 14 Days" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <select {...reg("type")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
              <option value="umrah">Umrah</option>
              <option value="ramadan_umrah">Ramadan Umrah</option>
              <option value="hajj">Hajj</option>
              <option value="special_hajj">Special Hajj</option>
              <option value="iraq_ziyarat">Iraq Ziyarat</option>
              <option value="baitul_muqaddas">Baitul Muqaddas</option>
              <option value="syria_ziyarat">Syria Ziyarat</option>
              <option value="jordan_heritage">Jordan Heritage</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Price per Person (₹) *</label>
            <Input type="number" {...reg("pricePerPerson", { required: true })} placeholder="e.g. 85000" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Duration</label>
            <Input {...reg("duration")} placeholder="e.g. 14 Days" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea {...reg("description")} className="w-full p-3 rounded-md border min-h-[90px] text-sm resize-none" placeholder="Brief description of the package..." />
          </div>

          {/* Cover Image — prominent, with live preview */}
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><Images size={13} /> Cover Image</label>
            <div className="flex gap-2 items-center">
              <Input {...reg("imageUrl")} placeholder="Paste image URL or upload →" className="flex-1" />
              {isEdit && onUpload && uploadRef && (
                <>
                  <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" disabled={mediaUploading}
                    onClick={() => uploadRef.current?.click()}>
                    <Upload size={13} /> Upload
                  </Button>
                  <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }} />
                </>
              )}
            </div>
            {imgSrc ? (
              <div className="relative rounded-xl overflow-hidden border h-32 mt-1">
                <img src={imgSrc} alt="Cover preview" className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-2 text-xs text-white bg-black/50 rounded px-1.5 py-0.5">Preview</span>
              </div>
            ) : (
              !isEdit && (
                <p className="text-xs text-muted-foreground">Paste a URL above. After creating, use the "Media" button on the card to upload a photo.</p>
              )
            )}
          </div>
        </div>
      )}

      {/* Travel */}
      {formTab === "travel" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Airline</label>
            <Input {...reg("airline")} placeholder="e.g. Saudi Airlines" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Departure Cities (comma sep)</label>
            <Input {...reg("departureCities")} placeholder="Mumbai, Delhi, Hyderabad" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Return Date</label>
            <Input {...reg("returnDate")} placeholder="e.g. 15 April 2027" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Visa</label>
            <Input {...reg("visa")} placeholder="e.g. Umrah Visa Included" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Transport</label>
            <Input {...reg("transport")} placeholder="e.g. AC Bus, Private Car" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Meal Plan</label>
            <Input {...reg("mealPlan")} placeholder="e.g. Breakfast + Dinner" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Room Type</label>
            <Input {...reg("roomType")} placeholder="e.g. Quad Sharing" />
          </div>
        </div>
      )}

      {/* Hotels */}
      {formTab === "hotels" && (
        <div className="space-y-5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Hotel size={12} /> Makkah Hotel
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hotel Name</label>
                <Input {...reg("hotelMakkah")} placeholder="e.g. Pullman ZamZam" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Input {...reg("hotelCategoryMakkah")} placeholder="e.g. 5 Star" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Distance from Haram</label>
                <Input {...reg("distanceMakkah")} placeholder="e.g. 100 meters" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1"><MapPin size={12} /> Location / Address</label>
                <Input {...reg("locationMakkah")} placeholder="e.g. Ajyad St, Makkah" />
              </div>
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Hotel size={12} /> Madinah Hotel
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Hotel Name</label>
                <Input {...reg("hotelMadinah")} placeholder="e.g. Shaza Al Madina" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Input {...reg("hotelCategoryMadinah")} placeholder="e.g. 4 Star" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Distance from Masjid</label>
                <Input {...reg("distanceMadinah")} placeholder="e.g. 200 meters" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1"><MapPin size={12} /> Location / Address</label>
                <Input {...reg("locationMadinah")} placeholder="e.g. King Fahd Rd, Madinah" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meena Tent */}
      {formTab === "meena" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select {...reg("meenaTentCategory")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="">Select Category</option>
                <option value="A">A (Premium)</option>
                <option value="B">B (Standard)</option>
                <option value="C">C (Economy)</option>
                <option value="D">D (Basic)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Zone</label>
              <select {...reg("meenaTentZone")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="">Select Zone</option>
                <option value="1">Zone 1</option>
                <option value="2">Zone 2</option>
                <option value="3">Zone 3</option>
                <option value="4">Zone 4</option>
                <option value="5">Zone 5</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><MapPin size={13} /> Meena Tent Location / Address</label>
            <Input {...reg("meenaTentLocation")} placeholder="e.g. Mina Tent Block 10, Makkah" />
          </div>

          {isEdit && editingPackageId ? (
            <>
              {/* Meena Photos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Images size={13} /> Meena Tent Photos ({(editingPkgData?.details?.meenaTentImageUrls || []).length})
                  </h4>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={meenaUploading} type="button"
                    onClick={() => meenaImgRef.current?.click()}>
                    <Upload size={13} /> Add Photo
                  </Button>
                  <input ref={meenaImgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadMeena(f, "image"); e.target.value = ""; } }} />
                </div>
                {(editingPkgData?.details?.meenaTentImageUrls || []).length === 0 ? (
                  <div className="border-2 border-dashed rounded-xl py-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => meenaImgRef.current?.click()}>
                    <Images size={22} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload Meena tent photos</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {(editingPkgData?.details?.meenaTentImageUrls || []).map((url: string, i: number) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border">
                        <img src={`${BASE_API}${url}`} alt={`Meena photo ${i + 1}`} className="w-full h-24 object-cover" />
                        <button type="button"
                          className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeMeena(url, "image")}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="border-2 border-dashed rounded-lg h-24 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => meenaImgRef.current?.click()}>
                      <Plus size={20} className="text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Meena Videos */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Video size={13} /> Meena Tent Videos ({(editingPkgData?.details?.meenaTentVideoUrls || []).length})
                  </h4>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={meenaUploading} type="button"
                    onClick={() => meenaVidRef.current?.click()}>
                    <Upload size={13} /> Add Video
                  </Button>
                  <input ref={meenaVidRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadMeena(f, "video"); e.target.value = ""; } }} />
                </div>
                {(editingPkgData?.details?.meenaTentVideoUrls || []).length === 0 ? (
                  <div className="border-2 border-dashed rounded-xl py-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => meenaVidRef.current?.click()}>
                    <Video size={22} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload Meena tent videos (MP4, MOV)</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(editingPkgData?.details?.meenaTentVideoUrls || []).map((url: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 border rounded-lg p-2 bg-muted/30">
                        <Video size={16} className="text-primary shrink-0" />
                        <video src={`${BASE_API}${url}`} className="h-16 rounded" controls />
                        <span className="text-xs text-muted-foreground flex-1 truncate">Video {i + 1}</span>
                        <button type="button" onClick={() => removeMeena(url, "video")} className="text-red-500 hover:text-red-700 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {meenaUploading && <p className="text-xs text-muted-foreground text-center animate-pulse">Uploading...</p>}
            </>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-border p-6 text-center">
              <Tent size={28} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Save the package first, then come back to upload Meena Tent photos & videos.</p>
            </div>
          )}
        </div>
      )}

      {/* Location */}
      {formTab === "location" && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">Paste Google Maps share links for each location so customers can navigate directly.</p>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Hotel size={12} /> Makkah Hotel — Google Maps
            </h4>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1"><Navigation size={12} /> Google Maps Link</label>
              <Input {...reg("googleMapsMakkah")} placeholder="https://maps.google.com/?q=..." />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Hotel size={12} /> Madinah Hotel — Google Maps
            </h4>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1"><Navigation size={12} /> Google Maps Link</label>
              <Input {...reg("googleMapsMapMadinah")} placeholder="https://maps.google.com/?q=..." />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tent size={12} /> Meena Tent — Google Maps
            </h4>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1"><Navigation size={12} /> Google Maps Link</label>
              <Input {...reg("googleMapsMeena")} placeholder="https://maps.google.com/?q=..." />
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {formTab === "settings" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Includes (comma separated)</label>
            <Input {...reg("includes")} placeholder="Visa, Flights, 5-Star Hotel, Ziyarat" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Departure Dates (comma separated)</label>
            <Input {...reg("departureDates")} placeholder="15 Oct 2025, 28 Oct 2025" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Highlights (comma separated)</label>
            <Input {...reg("highlights")} placeholder="Ziyarat, VIP Transport, Guided Tours" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">GST %</label>
              <Input type="number" {...reg("gstPercent")} placeholder="5" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Featured</label>
              <select {...reg("featured")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <select {...reg("isActive")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Package Management</h1>
          <p className="text-muted-foreground mt-1">Create, edit and manage travel packages.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (!open) { reset(); setFormTab("basic"); } }}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-white gap-2 rounded-xl">
              <Plus size={18} /> Add New Package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Create New Package</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
              <FormTabs reg={register} isEdit={false} watchedImageUrl={createImageUrl} />
              <Button type="submit" className="w-full mt-6" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Package"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={open => {
        setIsEditOpen(open);
        if (!open) { setEditingPackageId(null); setEditingPkgData(null); editForm.reset(); setFormTab("basic"); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Package</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="mt-4">
            <FormTabs reg={editForm.register} isEdit={true} watchedImageUrl={editImageUrl}
              onUpload={uploadEditCover} uploadRef={editCoverRef} />
            <Button type="submit" className="w-full mt-6" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Media Gallery Dialog */}
      <Dialog open={mediaOpen} onOpenChange={open => { setMediaOpen(open); if (!open) setMediaPkg(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Images size={18} /> Media Gallery — {mediaPkg?.name}
            </DialogTitle>
          </DialogHeader>
          {mediaPkg && (
            <div className="space-y-6 mt-2">
              {/* Cover Photo */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Cover Photo</h3>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={mediaUploading}
                    onClick={() => coverInputRef.current?.click()}>
                    <Upload size={13} /> {mediaPkg.imageUrl ? "Change Cover" : "Upload Cover"}
                  </Button>
                  <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadCover(f); e.target.value = ""; } }} />
                </div>
                {mediaPkg.imageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border h-36">
                    <img src={mediaPkg.imageUrl.startsWith("http") ? mediaPkg.imageUrl : `${BASE_API}${mediaPkg.imageUrl}`}
                      alt="Cover" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-3 py-1">Cover Photo</div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-xl py-6 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => coverInputRef.current?.click()}>
                    <Upload size={22} className="mx-auto text-muted-foreground mb-1" />
                    <p className="text-sm text-muted-foreground">Upload cover photo</p>
                  </div>
                )}
              </div>

              {/* Gallery Photos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Images size={13} /> Gallery Photos ({mediaPkg.imageUrls.length})
                  </h3>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={mediaUploading}
                    onClick={() => imgInputRef.current?.click()}>
                    <Upload size={13} /> Add Photo
                  </Button>
                  <input ref={imgInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadMedia(f, "image"); e.target.value = ""; } }} />
                </div>
                {mediaPkg.imageUrls.length === 0 ? (
                  <div className="border-2 border-dashed rounded-xl py-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => imgInputRef.current?.click()}>
                    <Images size={24} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No photos yet. Click to upload hotel and package photos.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {mediaPkg.imageUrls.map((url: string, i: number) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border">
                        <img src={`${BASE_API}${url}`} alt={`Photo ${i + 1}`} className="w-full h-24 object-cover" />
                        <button className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeMedia(url, "image")}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="border-2 border-dashed rounded-lg h-24 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => imgInputRef.current?.click()}>
                      <Plus size={20} className="text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Videos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Video size={13} /> Videos ({mediaPkg.videoUrls.length})
                  </h3>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={mediaUploading}
                    onClick={() => vidInputRef.current?.click()}>
                    <Upload size={13} /> Add Video
                  </Button>
                  <input ref={vidInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { uploadMedia(f, "video"); e.target.value = ""; } }} />
                </div>
                {mediaPkg.videoUrls.length === 0 ? (
                  <div className="border-2 border-dashed rounded-xl py-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => vidInputRef.current?.click()}>
                    <Video size={24} className="mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Upload tour and hotel videos (MP4, WebM, MOV).</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mediaPkg.videoUrls.map((url: string, i: number) => (
                      <div key={i} className="flex items-center gap-2 border rounded-lg p-2 bg-muted/30">
                        <Video size={16} className="text-primary shrink-0" />
                        <video src={`${BASE_API}${url}`} className="h-16 rounded" controls />
                        <span className="text-xs text-muted-foreground flex-1 truncate">Video {i + 1}</span>
                        <button onClick={() => removeMedia(url, "video")} className="text-red-500 hover:text-red-700 p-1">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {mediaUploading && <p className="text-sm text-muted-foreground text-center animate-pulse">Uploading...</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Package Cards Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse">Loading packages...</div>
      ) : packages.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <p className="text-muted-foreground">No packages yet. Click "Add New Package" to create one.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(packages as any[]).map((pkg: any) => {
            const details = pkg.details || {};
            const coverUrl = pkg.imageUrl
              ? (pkg.imageUrl.startsWith("http") ? pkg.imageUrl : `${BASE_API}${pkg.imageUrl}`)
              : null;
            const photoCount = (pkg.imageUrls || []).length;
            const videoCount = (pkg.videoUrls || []).length;
            const meenaPhotos = (details.meenaTentImageUrls || []).length;
            const meenaVideos = (details.meenaTentVideoUrls || []).length;
            return (
              <Card key={pkg.id} className="rounded-2xl border-none shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {/* Cover image */}
                <div className="relative h-36 bg-muted">
                  {coverUrl ? (
                    <img src={coverUrl} alt={pkg.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
                      <Hotel size={32} className="text-muted-foreground/40" />
                    </div>
                  )}
                  {pkg.featured && (
                    <span className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star size={10} /> Featured
                    </span>
                  )}
                  <span className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full ${pkg.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {pkg.isActive ? "Active" : "Inactive"}
                  </span>
                  {/* Media badges */}
                  {(photoCount > 0 || videoCount > 0) && (
                    <div className="absolute bottom-2 left-2 flex gap-1">
                      {photoCount > 0 && <span className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1"><Images size={10} /> {photoCount}</span>}
                      {videoCount > 0 && <span className="bg-black/60 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1"><Video size={10} /> {videoCount}</span>}
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-base leading-tight">{pkg.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{pkg.type?.replace(/_/g, " ")}</p>
                  </div>

                  <div className="text-xl font-bold text-primary">{formatCurrency(pkg.pricePerPerson)}<span className="text-xs font-normal text-muted-foreground"> /person</span></div>

                  {/* Hotel info */}
                  {(details.hotelMakkah || details.hotelMadinah) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {details.hotelMakkah && <div className="flex items-center gap-1"><Hotel size={10} /> Makkah: <span className="font-medium text-foreground">{details.hotelMakkah}{details.hotelCategoryMakkah ? ` · ${details.hotelCategoryMakkah}` : ""}</span></div>}
                      {details.hotelMadinah && <div className="flex items-center gap-1"><Hotel size={10} /> Madinah: <span className="font-medium text-foreground">{details.hotelMadinah}{details.hotelCategoryMadinah ? ` · ${details.hotelCategoryMadinah}` : ""}</span></div>}
                      {details.meenaTentLocation && <div className="flex items-center gap-1"><Tent size={10} /> Meena: <span className="font-medium text-foreground">{details.meenaTentLocation}</span></div>}
                    </div>
                  )}

                  {/* Meena media badge */}
                  {(meenaPhotos > 0 || meenaVideos > 0) && (
                    <div className="flex gap-1">
                      {meenaPhotos > 0 && <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-1.5 py-0.5 rounded flex items-center gap-1"><Tent size={9} /> {meenaPhotos} photos</span>}
                      {meenaVideos > 0 && <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-1.5 py-0.5 rounded flex items-center gap-1"><Video size={9} /> {meenaVideos} videos</span>}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t">
                    <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => handleEditClick(pkg)}>
                      <Edit size={12} /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => openMedia(pkg)}>
                      <Images size={12} /> Media
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                      onClick={() => handleDelete(pkg.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}
