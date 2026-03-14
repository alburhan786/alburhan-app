import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useListPackages, useCreatePackage, useUpdatePackage, useDeletePackage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2 } from "lucide-react";
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
      gstPercent: pkg.gstPercent || 5,
    });
    setIsEditOpen(true);
  };

  const onSubmit = async (data: any) => {
    try {
      const payload = {
        ...data,
        pricePerPerson: Number(data.pricePerPerson),
        gstPercent: Number(data.gstPercent) || 5,
        includes: data.includes ? data.includes.split(',').map((s:string) => s.trim()) : [],
        highlights: data.highlights ? data.highlights.split(',').map((s:string) => s.trim()) : [],
        departureDates: data.departureDates ? data.departureDates.split(',').map((s:string) => s.trim()) : [],
        isActive: data.isActive === 'true'
      };
      await createMutation.mutateAsync({ data: payload });
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
      const payload = {
        ...data,
        pricePerPerson: Number(data.pricePerPerson),
        gstPercent: Number(data.gstPercent) || 5,
        includes: data.includes ? data.includes.split(',').map((s:string) => s.trim()) : [],
        highlights: data.highlights ? data.highlights.split(',').map((s:string) => s.trim()) : [],
        departureDates: data.departureDates ? data.departureDates.split(',').map((s:string) => s.trim()) : [],
        isActive: data.isActive === 'true'
      };
      await updateMutation.mutateAsync({ id: editingPackageId, data: payload });
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
        <textarea {...reg("description")} className="w-full p-3 rounded-md border min-h-[100px]" />
      </div>
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
        <label className="text-sm font-medium">Active Status</label>
        <select {...reg("isActive")} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
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
              ) : packages.map(pkg => (
                <tr key={pkg.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-foreground">{pkg.name}</div>
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
