import { useState } from "react";
import { useParams, Link } from "wouter";
import { useGetPackage, useCreateBooking } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Calendar, Clock, MapPin, CheckCircle2, ChevronRight } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const bookingSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  customerMobile: z.string().min(10, "Valid mobile is required"),
  customerEmail: z.string().email().optional().or(z.literal("")),
  numberOfPilgrims: z.coerce.number().min(1, "At least 1 pilgrim required"),
  preferredDepartureDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
  pilgrims: z.array(z.object({
    name: z.string().min(2, "Name is required"),
    passportNumber: z.string().optional(),
  })).min(1, "Add at least one pilgrim detail")
});

type BookingForm = z.infer<typeof bookingSchema>;

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isLoading } = useGetPackage(id);
  const createBooking = useCreateBooking();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      numberOfPilgrims: 1,
      pilgrims: [{ name: '', passportNumber: '' }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: "pilgrims" });
  const numPilgrims = watch("numberOfPilgrims") || 1;

  const onSubmit = async (data: BookingForm) => {
    try {
      await createBooking.mutateAsync({
        data: {
          packageId: id,
          ...data,
        }
      });
      setIsOpen(false);
      toast({
        title: "Booking Request Submitted",
        description: "Your request is pending. Our team will contact you shortly.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit booking.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) return <MainLayout><div className="flex justify-center py-32"><div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full" /></div></MainLayout>;
  if (!pkg) return <MainLayout><div className="py-32 text-center text-xl">Package not found</div></MainLayout>;

  return (
    <MainLayout>
      {/* Header Banner */}
      <div className="relative h-[50vh] bg-black">
        {/* stock package image */}
        <img src={pkg.imageUrl || "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=1920&q=80"} alt={pkg.name} className="w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 container mx-auto px-4 pb-12">
          <div className="inline-block bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider mb-4">
            {pkg.type.replace('_', ' ')}
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground mb-4">{pkg.name}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Main Details */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* Quick Stats */}
            <div className="flex flex-wrap gap-6 p-6 bg-white rounded-2xl shadow-sm border border-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Clock size={24}/></div>
                <div><p className="text-sm text-muted-foreground">Duration</p><p className="font-bold">{pkg.duration}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary"><MapPin size={24}/></div>
                <div><p className="text-sm text-muted-foreground">Locations</p><p className="font-bold">Makkah & Madinah</p></div>
              </div>
            </div>

            {/* Description */}
            <section>
              <h2 className="text-2xl font-serif font-bold mb-4 flex items-center gap-2"><ChevronRight className="text-accent"/> About the Package</h2>
              <p className="text-lg text-foreground/80 leading-relaxed whitespace-pre-wrap">{pkg.description || "No description provided."}</p>
            </section>

            {/* Includes & Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {pkg.includes && pkg.includes.length > 0 && (
                <div className="bg-muted/30 p-6 rounded-2xl">
                  <h3 className="text-xl font-serif font-bold mb-4">What's Included</h3>
                  <ul className="space-y-3">
                    {pkg.includes.map((inc, i) => (
                      <li key={i} className="flex items-start gap-3"><CheckCircle2 className="text-accent shrink-0 mt-0.5" size={20} /> <span className="text-foreground/80">{inc}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {pkg.highlights && pkg.highlights.length > 0 && (
                <div className="bg-primary/5 p-6 rounded-2xl">
                  <h3 className="text-xl font-serif font-bold mb-4 text-primary">Highlights</h3>
                  <ul className="space-y-3">
                    {pkg.highlights.map((hlt, i) => (
                      <li key={i} className="flex items-start gap-3"><div className="w-2 h-2 rounded-full bg-accent mt-2 shrink-0" /> <span className="text-foreground/80">{hlt}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Booking Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-3xl shadow-xl border border-border/50 p-8 sticky top-28">
              <div className="mb-6 pb-6 border-b border-border">
                <p className="text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-2">Price Per Person</p>
                <div className="text-4xl font-bold text-primary mb-1">{formatCurrency(pkg.pricePerPerson)}</div>
                <p className="text-sm text-muted-foreground">+ {pkg.gstPercent}% GST Applicable</p>
              </div>

              {pkg.departureDates && pkg.departureDates.length > 0 && (
                <div className="mb-8">
                  <p className="font-semibold mb-3">Available Dates</p>
                  <div className="flex flex-wrap gap-2">
                    {pkg.departureDates.map((date, i) => (
                      <span key={i} className="bg-muted px-3 py-1.5 rounded-lg text-sm">{date}</span>
                    ))}
                  </div>
                </div>
              )}

              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90 py-6 text-lg rounded-xl shadow-lg shadow-accent/20 transition-transform hover:-translate-y-1">
                    Request Booking
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-2xl text-primary">Booking Request</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name *</Label>
                        <Input {...register("customerName")} placeholder="John Doe" />
                        {errors.customerName && <p className="text-sm text-destructive">{errors.customerName.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Mobile Number *</Label>
                        <Input {...register("customerMobile")} placeholder="+91..." />
                        {errors.customerMobile && <p className="text-sm text-destructive">{errors.customerMobile.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Email (Optional)</Label>
                        <Input {...register("customerEmail")} placeholder="john@example.com" type="email" />
                      </div>
                      <div className="space-y-2">
                        <Label>Preferred Date *</Label>
                        <select 
                          {...register("preferredDepartureDate")} 
                          className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Select Date</option>
                          {pkg.departureDates?.map(d => <option key={d} value={d}>{d}</option>)}
                          <option value="Flexible">Flexible / Other</option>
                        </select>
                        {errors.preferredDepartureDate && <p className="text-sm text-destructive">{errors.preferredDepartureDate.message}</p>}
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-4">
                      <Label>Number of Pilgrims *</Label>
                      <Input 
                        type="number" 
                        min="1" 
                        {...register("numberOfPilgrims", { 
                          onChange: (e) => {
                            const val = parseInt(e.target.value) || 1;
                            const diff = val - fields.length;
                            if (diff > 0) {
                              for(let i=0; i<diff; i++) append({ name: '', passportNumber: '' });
                            } else if (diff < 0) {
                              for(let i=0; i<-diff; i++) remove(fields.length - 1);
                            }
                          }
                        })} 
                      />
                    </div>

                    <div className="space-y-4">
                      <Label>Pilgrim Details</Label>
                      {fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="space-y-1">
                            <Label className="text-xs">Pilgrim {index + 1} Name *</Label>
                            <Input {...register(`pilgrims.${index}.name`)} placeholder="Name as per passport" />
                            {errors.pilgrims?.[index]?.name && <p className="text-xs text-destructive">{errors.pilgrims[index]?.name?.message}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Passport Number (Optional)</Label>
                            <Input {...register(`pilgrims.${index}.passportNumber`)} placeholder="Optional" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <Label>Additional Notes</Label>
                      <textarea 
                        {...register("notes")} 
                        className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Any special requests?"
                      />
                    </div>

                    <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white" disabled={createBooking.isPending}>
                      {createBooking.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              
              <p className="text-center text-sm text-muted-foreground mt-4">
                No payment required at this step.
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
