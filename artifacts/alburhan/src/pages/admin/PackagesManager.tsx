import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListPackages, useCreatePackage, useUpdatePackage, useDeletePackage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";

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

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const editForm = useForm();

  const handleEditClick = (pkg: any) => {
    setEditingPackageId(pkg.id);
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
      roomType: details.roomType || "",
      mealPlan: details.mealPlan || "",
      transport: details.transport || "",
      visa: details.visa || "",
    });
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
    if (data.roomType) details.roomType = data.roomType;
    if (data.mealPlan) details.mealPlan = data.mealPlan;
    if (data.transport) details.transport = data.transport;
    if (data.visa) details.visa = data.visa;

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
    } catch (err:any) {
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
      editForm.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
    } catch (err:any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this package?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast({ title: "Package deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/packages'] });
    } catch (err:any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const PackageFormFields = ({ reg }: { reg: any }) => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
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
            <label className="text-sm font-medium">Price (per person)</label>
            <Input type="number" {...reg("pricePerPerson", { required: true })} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Duration</label>
            <Input {...reg("duration")} placeholder="14 Days" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Description</label>
            <textarea {...reg("description")} className="w-full p-3 rounded-md border min-h-[80px] text-sm" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Travel Details</h3>
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
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Hotels</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Hotel Makkah</label>
            <Input {...reg("hotelMakkah")} placeholder="e.g. Pullman ZamZam" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Hotel Madinah</label>
            <Input {...reg("hotelMadinah")} placeholder="e.g. Shaza Al Madina" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Category Makkah</label>
            <Input {...reg("hotelCategoryMakkah")} placeholder="e.g. 5 Star" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Category Madinah</label>
            <Input {...reg("hotelCategoryMadinah")} placeholder="e.g. 4 Star" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Distance from Haram (Makkah)</label>
            <Input {...reg("distanceMakkah")} placeholder="e.g. 100 meters" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Distance from Masjid (Madinah)</label>
            <Input {...reg("distanceMadinah")} placeholder="e.g. 200 meters" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Lists & Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Includes (comma separated)</label>
            <Input {...reg("includes")} placeholder="Visa, Flights, 5-Star Hotel" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Departure Dates (comma separated)</label>
            <Input {...reg("departureDates")} placeholder="15 Oct 2024, 28 Oct 2024" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Highlights (comma separated)</label>
            <Input {...reg("highlights")} placeholder="Ziyarat, VIP Transport, Guided Tours" />
          </div>
          <div className="col-span-2 space-y-2">
            <label className="text-sm font-medium">Image URL</label>
            <Input {...reg("imageUrl")} placeholder="https://..." />
          </div>
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
            <label className="text-sm font-medium">Active Status</label>
            <select {...reg("isActive")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Package Management</h1>
          <p className="text-muted-foreground mt-1">Create, edit and manage travel packages.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-white gap-2 rounded-xl">
              <Plus size={18} /> Add New Package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Create New Package</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <PackageFormFields reg={register} />
              <Button type="submit" className="w-full mt-6" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Package"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setEditingPackageId(null);
          editForm.reset();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Package</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 mt-4">
            <PackageFormFields reg={editForm.register} />
            <Button type="submit" className="w-full mt-6" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="border-none shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Package Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
              ) : packages.map((pkg: any) => (
                <tr key={pkg.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-foreground">{pkg.name}</div>
                      {pkg.featured && <Star size={14} className="text-amber-500" fill="currentColor" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{pkg.duration}</div>
                  </td>
                  <td className="px-6 py-4 uppercase text-xs font-bold tracking-wider text-primary">{pkg.type.replace('_', ' ')}</td>
                  <td className="px-6 py-4 font-medium">{formatCurrency(pkg.pricePerPerson)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${pkg.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {pkg.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => handleEditClick(pkg)}>
                        <Edit size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(pkg.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminLayout>
  );
}
