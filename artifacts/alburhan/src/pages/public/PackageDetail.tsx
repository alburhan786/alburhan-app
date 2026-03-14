import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useGetPackage, useCreateBooking, useListBookings, type Package, type PackageDetails, type Booking } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { usePayment } from "@/hooks/use-payment";
import { formatCurrency } from "@/lib/utils";
import { ChevronLeft, Star, Check, X, Share2, Plane, Building2, MapPin, UtensilsCrossed, Bus, FileText, Users, Calendar, Clock, CreditCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const bookingSchema = z.object({
  customerName: z.string().min(2, "Name is required"),
  customerMobile: z.string().min(10, "Valid mobile is required"),
  customerEmail: z.string().email().optional().or(z.literal("")),
  numberOfPilgrims: z.coerce.number().min(1),
  preferredDepartureDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
  pilgrims: z.array(z.object({
    name: z.string().min(2, "Name is required"),
    passportNumber: z.string().optional(),
  })).min(1)
});
type BookingForm = z.infer<typeof bookingSchema>;

const TYPE_DISPLAY: Record<string, string> = {
  umrah: "Premium Umrah",
  ramadan_umrah: "Ramadan Umrah",
  hajj: "Hajj Package",
  special_hajj: "Special Hajj Package",
  iraq_ziyarat: "Iraq Ziyarat",
  baitul_muqaddas: "Baitul Muqaddas",
  syria_ziyarat: "Syria Ziyarat",
  jordan_heritage: "Jordan Heritage",
};

const TYPE_KEY: Record<string, string> = {
  umrah: "UMRAH",
  ramadan_umrah: "RAMADAN",
  hajj: "HAJJ",
  special_hajj: "SPECIAL HAJJ",
  iraq_ziyarat: "IRAQ ZIYARAT",
  baitul_muqaddas: "BAITUL MUQADDAS",
  syria_ziyarat: "SYRIA",
  jordan_heritage: "JORDAN",
};

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <Icon size={16} className="text-primary/70" />
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <span className="font-semibold text-sm text-foreground text-right max-w-[55%]">{value}</span>
    </div>
  );
}

export default function PackageDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isLoading } = useGetPackage(id);
  const createBooking = useCreateBooking();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { initiatePayment, isInitializing: isPaymentLoading } = usePayment();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const { data: bookingsData } = useListBookings(
    {},
    { query: { enabled: isAuthenticated } }
  );

  const approvedBooking = bookingsData?.bookings?.find(
    (b: Booking) => b.packageId === id && b.status === "approved"
  );

  const pendingBooking = bookingsData?.bookings?.find(
    (b: Booking) => b.packageId === id && b.status === "pending"
  );

  const { register, control, handleSubmit, formState: { errors } } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      numberOfPilgrims: 1,
      pilgrims: [{ name: '', passportNumber: '' }],
      customerName: user?.name || '',
      customerMobile: user?.mobile || '',
      customerEmail: user?.email || '',
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: "pilgrims" });

  const handleBookNow = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "Please login first to book this package.",
      });
      setLocation("/login");
      return;
    }
    setIsOpen(true);
  };

  const handlePayNow = () => {
    if (!approvedBooking) return;
    initiatePayment(
      approvedBooking.id,
      approvedBooking.customerName,
      approvedBooking.customerEmail || "",
      approvedBooking.customerMobile
    );
  };

  const onSubmit = async (data: BookingForm) => {
    try {
      await createBooking.mutateAsync({ data: { packageId: id, ...data } });
      setIsOpen(false);
      toast({ title: "Booking Request Submitted!", description: "Our team will review and contact you shortly. Jazak Allah Khair!" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to submit booking.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleWhatsAppShare = () => {
    const msg = `Assalamu Alaikum! I'm interested in the *${pkg?.name}* package.\n\nDuration: ${pkg?.duration}\nPrice: Starting from ${formatCurrency(pkg?.pricePerPerson || 0)} + 5% GST\n\nPlease share more details. JazakAllah Khair!`;
    window.open(`https://wa.me/919893225590?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: pkg?.name, text: `Check out ${pkg?.name} by Al Burhan Tours & Travels`, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!" });
    }
  };

  if (isLoading) return (
    <MainLayout>
      <div className="flex justify-center items-center py-40">
        <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    </MainLayout>
  );

  if (!pkg) return (
    <MainLayout>
      <div className="py-32 text-center">
        <p className="text-xl font-bold text-foreground mb-4">Package not found</p>
        <Link href="/packages"><Button>Back to Packages</Button></Link>
      </div>
    </MainLayout>
  );

  const details: PackageDetails = pkg.details || {};
  const exclusions = ["5% GST", "Personal expenses", "Travel insurance", "Qurbani"];

  const renderBottomCTA = () => {
    if (approvedBooking) {
      return (
        <button
          onClick={handlePayNow}
          disabled={isPaymentLoading}
          className="px-8 py-3 bg-primary text-white font-bold rounded-2xl text-base shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
        >
          <CreditCard size={18} />
          {isPaymentLoading ? "Processing..." : "Pay Now"}
        </button>
      );
    }
    if (pendingBooking) {
      return (
        <button
          disabled
          className="px-8 py-3 bg-amber-500 text-white font-bold rounded-2xl text-base shadow-lg opacity-80 cursor-not-allowed"
        >
          Booking Pending
        </button>
      );
    }
    if (!isAuthenticated) {
      return (
        <button
          onClick={handleBookNow}
          className="px-8 py-3 bg-primary text-white font-bold rounded-2xl text-base shadow-lg hover:bg-primary/90 transition-colors"
        >
          Login to Book
        </button>
      );
    }
    return (
      <button
        onClick={handleBookNow}
        className="px-8 py-3 bg-primary text-white font-bold rounded-2xl text-base shadow-lg hover:bg-primary/90 transition-colors"
      >
        Book Now
      </button>
    );
  };

  return (
    <MainLayout>
      <div className="bg-white border-b border-border sticky top-[96px] z-40 flex items-center justify-between px-4 py-3">
        <Link href="/packages">
          <button className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors">
            <ChevronLeft size={18} /> Packages
          </button>
        </Link>
        <span className="text-primary font-semibold text-sm">Package Details</span>
        <div className="w-20" />
      </div>

      <div className="bg-background min-h-screen pb-32">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 rounded-full bg-primary text-white text-xs font-bold">
              {TYPE_KEY[pkg.type] || pkg.type.toUpperCase()}
            </span>
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              {TYPE_DISPLAY[pkg.type] || pkg.type.replace('_', ' ')}
            </span>
            {pkg.featured && (
              <span className="px-3 py-1 rounded-full text-white text-xs font-bold flex items-center gap-1" style={{ backgroundColor: 'hsl(33, 90%, 48%)' }}>
                <Star size={10} fill="white" /> FEATURED
              </span>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-3 font-sans">{pkg.name}</h1>
            {pkg.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">{pkg.description}</p>
            )}
          </div>

          <div>
            <h2 className="font-bold text-foreground text-base mb-3">Package Details</h2>
            <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-sm">
              <DetailRow icon={Clock} label="Duration" value={pkg.duration || 'TBD'} />
              {details.airline && (
                <DetailRow icon={Plane} label="Airline" value={details.airline} />
              )}
              {details.departureCities && details.departureCities.length > 0 && (
                <DetailRow icon={MapPin} label="Departure Cities" value={details.departureCities.join(', ')} />
              )}
              {pkg.departureDates && pkg.departureDates.length > 0 && (
                <DetailRow icon={Calendar} label="Departure Date" value={pkg.departureDates[0]} />
              )}
              {details.returnDate && (
                <DetailRow icon={Calendar} label="Return Date" value={details.returnDate} />
              )}
              {details.visa && (
                <DetailRow icon={FileText} label="Visa" value={details.visa} />
              )}
              {details.transport && (
                <DetailRow icon={Bus} label="Transport" value={details.transport} />
              )}
              {details.mealPlan && (
                <DetailRow icon={UtensilsCrossed} label="Meals" value={details.mealPlan} />
              )}
              {details.roomType && (
                <DetailRow icon={Users} label="Room Type" value={details.roomType} />
              )}
              {details.hotelMakkah && (
                <DetailRow icon={Building2} label="Hotel (Makkah)" value={`${details.hotelMakkah}${details.hotelCategoryMakkah ? ` – ${details.hotelCategoryMakkah}` : ''}`} />
              )}
              {details.distanceMakkah && (
                <DetailRow icon={MapPin} label="Distance (Haram)" value={details.distanceMakkah} />
              )}
              {details.hotelMadinah && (
                <DetailRow icon={Building2} label="Hotel (Madinah)" value={`${details.hotelMadinah}${details.hotelCategoryMadinah ? ` – ${details.hotelCategoryMadinah}` : ''}`} />
              )}
              {details.distanceMadinah && (
                <DetailRow icon={MapPin} label="Distance (Masjid Nabawi)" value={details.distanceMadinah} />
              )}
              <DetailRow icon={FileText} label="GST" value={`${pkg.gstPercent}% (excluded)`} />
            </div>
          </div>

          <div>
            <h2 className="font-bold text-foreground text-base mb-3">Room Pricing</h2>
            <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Quad Sharing (4 persons)</span>
                <span className="font-semibold text-sm text-primary">{formatCurrency(pkg.pricePerPerson)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <span className="text-muted-foreground text-sm">Triple Sharing (3 persons)</span>
                <span className="font-semibold text-sm text-primary">{formatCurrency(Math.round(pkg.pricePerPerson * 1.15))}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-muted-foreground text-sm">Double Sharing (2 persons)</span>
                <span className="font-semibold text-sm text-primary">{formatCurrency(Math.round(pkg.pricePerPerson * 1.3))}</span>
              </div>
            </div>
          </div>

          {pkg.includes && pkg.includes.length > 0 && (
            <div>
              <h2 className="font-bold text-foreground text-base mb-3">Inclusions</h2>
              <div className="bg-white rounded-2xl border border-border/60 p-4 shadow-sm space-y-3">
                {pkg.includes.map((inc, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={12} className="text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-foreground text-sm">{inc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pkg.highlights && pkg.highlights.length > 0 && (
            <div>
              <h2 className="font-bold text-foreground text-base mb-3">Highlights</h2>
              <div className="bg-white rounded-2xl border border-border/60 p-4 shadow-sm space-y-3">
                {pkg.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-primary font-bold text-xs bg-primary/10">
                      {i + 1}
                    </div>
                    <span className="text-foreground text-sm">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-bold text-foreground text-base mb-3">Exclusions</h2>
            <div className="bg-white rounded-2xl border border-border/60 p-4 shadow-sm space-y-3">
              {exclusions.map((exc, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <X size={12} className="text-red-500" strokeWidth={3} />
                  </div>
                  <span className="text-foreground text-sm">{exc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-bold text-foreground text-base mb-3">Share Package</h2>
            <div className="flex gap-3">
              <button
                onClick={handleWhatsAppShare}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white text-sm font-semibold"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Send on WhatsApp
              </button>
              <button
                onClick={handleShare}
                className="w-12 h-12 rounded-xl border border-border bg-white flex items-center justify-center text-foreground hover:bg-muted transition-colors"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border px-4 py-3 flex items-center justify-between shadow-2xl">
        <div>
          <p className="text-muted-foreground text-xs">Starting from</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(pkg.pricePerPerson)}</p>
          <p className="text-xs text-muted-foreground">
            + {pkg.gstPercent}% GST
            {details.airline && <span className="ml-2 text-primary">| {details.airline}</span>}
          </p>
          {(details.hotelCategoryMakkah || details.hotelCategoryMadinah) && (
            <div className="flex gap-1.5 mt-1">
              {details.hotelCategoryMakkah && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                  {'★'} {details.hotelCategoryMakkah}
                </span>
              )}
              {details.hotelCategoryMadinah && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
                  {'★'} {details.hotelCategoryMadinah}
                </span>
              )}
            </div>
          )}
        </div>

        {renderBottomCTA()}

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-bold text-xl text-foreground">Complete Your Booking</DialogTitle>
              <p className="text-muted-foreground text-sm">{pkg.name}</p>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
              <div>
                <Label className="font-semibold mb-2 block">Number of Travelers</Label>
                <Input
                  type="number" min="1"
                  {...register("numberOfPilgrims", {
                    onChange: (e) => {
                      const val = parseInt(e.target.value) || 1;
                      const diff = val - fields.length;
                      if (diff > 0) for (let i = 0; i < diff; i++) append({ name: '', passportNumber: '' });
                      else if (diff < 0) for (let i = 0; i < -diff; i++) remove(fields.length - 1);
                    }
                  })}
                />
              </div>

              <div>
                <Label className="font-semibold mb-3 block">Traveler Details</Label>
                {fields.map((field, index) => (
                  <div key={field.id} className="bg-muted/30 rounded-xl p-4 space-y-3 mb-3">
                    <p className="font-semibold text-sm">Traveler {index + 1}</p>
                    <Input {...register(`pilgrims.${index}.name`)} placeholder="Full name (as per passport)" />
                    {errors.pilgrims?.[index]?.name && <p className="text-xs text-destructive">{errors.pilgrims[index]?.name?.message}</p>}
                    <Input {...register(`pilgrims.${index}.passportNumber`)} placeholder="Passport number (optional)" />
                  </div>
                ))}
              </div>

              <div>
                <Label className="font-semibold mb-2 block">Contact Details</Label>
                <div className="space-y-3">
                  <Input {...register("customerName")} placeholder="Full name" defaultValue={user?.name || ''} />
                  {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
                  <Input {...register("customerMobile")} placeholder="Mobile number" type="tel" defaultValue={user?.mobile || ''} />
                  {errors.customerMobile && <p className="text-xs text-destructive">{errors.customerMobile.message}</p>}
                  <Input {...register("customerEmail")} placeholder="Email (optional)" type="email" defaultValue={user?.email || ''} />
                </div>
              </div>

              <div>
                <Label className="font-semibold mb-2 block">Preferred Departure Date</Label>
                <select
                  {...register("preferredDepartureDate")}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select date</option>
                  {pkg.departureDates?.map((d) => <option key={d} value={d}>{d}</option>)}
                  <option value="Flexible">Flexible / Other</option>
                </select>
                {errors.preferredDepartureDate && <p className="text-xs text-destructive">{errors.preferredDepartureDate.message}</p>}
              </div>

              <div>
                <Label className="font-semibold mb-2 block">Special Requests (optional)</Label>
                <textarea
                  {...register("notes")}
                  className="w-full min-h-[70px] rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Any special requirements?"
                />
              </div>

              <Button type="submit" className="w-full bg-primary text-white h-12 text-base font-bold rounded-xl" disabled={createBooking.isPending}>
                {createBooking.isPending ? "Submitting..." : "Submit Booking Request"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">No payment required at this step</p>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
