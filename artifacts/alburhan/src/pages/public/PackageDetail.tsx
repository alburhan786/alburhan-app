import { useState, useEffect } from "react";
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
import { ChevronLeft, ChevronDown, Star, Check, X, Share2, Plane, Building2, MapPin, UtensilsCrossed, Bus, FileText, Users, Calendar, Clock, CreditCard, ArrowRight, Shield, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getItinerary(type: string, duration: string | null | undefined) {
  const days = parseInt(duration || "14") || 14;
  const itineraries: Record<string, { day: string; title: string; desc: string }[]> = {
    umrah: [
      { day: "Day 1", title: "Departure & Arrival in Madinah", desc: "Board your flight from India to Madinah. Upon arrival, transfer to your hotel near Masjid-e-Nabawi. Rest and freshen up." },
      { day: "Day 2-4", title: "Madinah Ziyarat", desc: "Visit Masjid-e-Nabawi, Roza-e-Rasool (S.A.W), Jannat-ul-Baqi, Masjid Quba, Masjid Qiblatain, Uhud Mountain, and other sacred sites in Madinah." },
      { day: `Day 5`, title: "Transfer to Makkah", desc: "After Fajr prayer, board the bus to Makkah. Check-in to your hotel near Masjid-ul-Haram." },
      { day: `Day 5`, title: "Umrah Rituals", desc: "Perform Umrah: Ihram, Tawaf around the Holy Kaaba, Sa'ee between Safa and Marwah, and Halq/Taqseer." },
      { day: `Day 6-${Math.max(days - 2, 8)}`, title: "Makkah Stay & Ziyarat", desc: "Daily prayers at Masjid-ul-Haram. Visit Jabal-e-Noor (Cave Hira), Jabal-e-Rehmat, Mina, Muzdalifah, Arafat, and other historic sites." },
      { day: `Day ${Math.max(days - 1, 9)}`, title: "Free Day & Shopping", desc: "Free time for additional Tawaf, personal prayers, and shopping for souvenirs and gifts." },
      { day: `Day ${days}`, title: "Departure", desc: "Check out from hotel. Transfer to Jeddah Airport for your return flight to India." },
    ],
    ramadan_umrah: [
      { day: "Day 1", title: "Departure & Arrival", desc: "Board your flight from India. Arrive in Madinah and transfer to your hotel near Masjid-e-Nabawi." },
      { day: "Day 2-5", title: "Madinah During Ramadan", desc: "Experience the blessed month of Ramadan in Madinah. Daily Taraweeh prayers at Masjid-e-Nabawi, Iftar arrangements, and Madinah Ziyarat." },
      { day: "Day 6", title: "Transfer to Makkah", desc: "Travel to Makkah. Check-in near Masjid-ul-Haram. Perform Umrah rituals." },
      { day: "Day 7-12", title: "Ramadan in Makkah", desc: "Special Ramadan prayers, Taraweeh, and Tahajjud at Masjid-ul-Haram. Daily Iftar and Suhoor arrangements near the Haram." },
      { day: "Day 13-14", title: "Last Days & Departure", desc: "Final prayers and Tawaf-e-Wida. Transfer to airport for return journey." },
    ],
    hajj: [
      { day: "Day 1-3", title: "Arrival & Makkah Stay", desc: "Arrive in Jeddah/Makkah. Transfer to hotel. Perform Tawaf-e-Qudoom and initial prayers at Masjid-ul-Haram." },
      { day: "Day 4-7", title: "Pre-Hajj Preparation", desc: "Hajj training sessions, Makkah Ziyarat, and spiritual preparation for the sacred pilgrimage." },
      { day: "8th Dhul Hijjah", title: "Mina (Yawm al-Tarwiyah)", desc: "Don Ihram and proceed to Mina. Pray Dhuhr, Asr, Maghrib, Isha, and Fajr at Mina camps." },
      { day: "9th Dhul Hijjah", title: "Arafat & Muzdalifah", desc: "Stand at Arafat (Wuquf) — the most important pillar of Hajj. After sunset, proceed to Muzdalifah for overnight stay." },
      { day: "10th Dhul Hijjah", title: "Eid ul-Adha & Jamarat", desc: "Pelt Jamrat al-Aqabah, sacrifice, shave/trim hair, perform Tawaf-e-Ifadah and Sa'ee." },
      { day: "11-12th Dhul Hijjah", title: "Days of Tashreeq", desc: "Stay in Mina. Pelt all three Jamarat on both days. Return to Makkah hotel." },
      { day: "Post-Hajj", title: "Madinah Visit", desc: "Travel to Madinah for Ziyarat. Visit Masjid-e-Nabawi, Roza-e-Rasool (S.A.W), and other sacred sites." },
      { day: "Final Day", title: "Tawaf-e-Wida & Departure", desc: "Perform farewell Tawaf. Transfer to airport for return flight to India." },
    ],
    iraq_ziyarat: [
      { day: "Day 1", title: "Arrival in Najaf", desc: "Arrive at Najaf Airport. Transfer to hotel. Visit the holy shrine of Imam Ali (A.S)." },
      { day: "Day 2", title: "Najaf Ziyarat", desc: "Visit Wadi-us-Salaam cemetery, Masjid-e-Kufa, Masjid-e-Sahla, and other sacred sites in Najaf." },
      { day: "Day 3-4", title: "Karbala Ziyarat", desc: "Travel to Karbala. Visit the holy shrines of Imam Hussain (A.S) and Hazrat Abbas (A.S). Explore surrounding historical sites." },
      { day: "Day 5", title: "Kazmain & Samarra", desc: "Visit Kazmain shrine of Imam Musa Kazim (A.S) and Imam Jawad (A.S). Proceed to Samarra for Imam Hadi (A.S) and Imam Askari (A.S) shrines." },
      { day: "Day 6-7", title: "Baghdad & Departure", desc: "Explore Baghdad's Islamic sites. Final Ziyarat and shopping. Transfer to airport for return." },
    ],
  };
  return itineraries[type] || itineraries.umrah || [];
}

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
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon size={15} className="text-primary/70" />
        </div>
        <span className="text-muted-foreground text-sm">{label}</span>
      </div>
      <span className="font-semibold text-sm text-foreground text-right max-w-[55%]">{value}</span>
    </div>
  );
}

function ItineraryAccordion({ type, duration }: { type: string; duration: string | null | undefined }) {
  const itinerary = getItinerary(type, duration);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  if (itinerary.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}>
      <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
        <div className="w-1 h-6 rounded-full bg-primary" />
        Day-by-Day Itinerary
      </h2>
      <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-sm divide-y divide-border/40">
        {itinerary.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/8 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] text-primary/60 font-medium uppercase leading-none">{item.day.split(' ')[0]}</span>
                  <span className="text-sm font-bold text-primary leading-tight">{item.day.split(' ').slice(1).join(' ')}</span>
                </div>
                <span className="font-semibold text-foreground text-sm">{item.title}</span>
              </div>
              <ChevronDown
                size={18}
                className={`text-muted-foreground shrink-0 transition-transform duration-300 ${openIdx === i ? 'rotate-180' : ''}`}
              />
            </button>
            <AnimatePresence>
              {openIdx === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-4 pl-[4.75rem]">
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
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

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      numberOfPilgrims: 1,
      pilgrims: [{ name: '', passportNumber: '' }],
      customerName: user?.name || '',
      customerMobile: user?.mobile || '',
      customerEmail: user?.email || '',
    }
  });

  useEffect(() => {
    if (user) {
      reset({
        numberOfPilgrims: 1,
        pilgrims: [{ name: '', passportNumber: '' }],
        customerName: user.name || '',
        customerMobile: user.mobile || '',
        customerEmail: user.email || '',
      });
    }
  }, [user, reset]);

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
    window.open(`https://wa.me/918989701701?text=${encodeURIComponent(msg)}`, '_blank');
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

  const renderCTAButton = () => {
    if (approvedBooking) {
      return (
        <button
          onClick={handlePayNow}
          disabled={isPaymentLoading}
          className="w-full py-4 gold-gradient text-dark-green font-bold rounded-xl text-base shadow-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <CreditCard size={18} />
          {isPaymentLoading ? "Processing..." : "Pay Now"}
        </button>
      );
    }
    if (pendingBooking) {
      return (
        <button disabled className="w-full py-4 bg-amber-500 text-white font-bold rounded-xl text-base shadow-lg opacity-80 cursor-not-allowed">
          Booking Under Review
        </button>
      );
    }
    return (
      <button
        onClick={handleBookNow}
        className="w-full py-4 bg-primary text-white font-bold rounded-xl text-base shadow-lg hover:bg-primary/90 transition-colors"
      >
        {!isAuthenticated ? "Login to Book" : "Book This Package"}
      </button>
    );
  };

  return (
    <MainLayout>
      <section className="relative bg-dark-green overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={pkg.imageUrl ? (pkg.imageUrl.startsWith('http') ? pkg.imageUrl : `${API_BASE}${pkg.imageUrl}`) : "https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=1200&q=80"}
            alt={pkg.name}
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-green via-dark-green/80 to-dark-green/50" />
        </div>
        <div className="container mx-auto px-4 relative z-10 py-8 pb-12">
          <Link href="/packages">
            <button className="flex items-center gap-1.5 text-sm font-medium text-white/70 hover:text-white transition-colors mb-6">
              <ChevronLeft size={16} /> Back to Packages
            </button>
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 rounded-lg bg-white/15 backdrop-blur-sm text-white text-xs font-bold border border-white/10">
                {TYPE_KEY[pkg.type] || pkg.type.toUpperCase()}
              </span>
              <span className="px-3 py-1 rounded-lg bg-gold/20 text-gold text-xs font-semibold border border-gold/20">
                {TYPE_DISPLAY[pkg.type] || pkg.type.replace('_', ' ')}
              </span>
              {pkg.featured && (
                <span className="px-3 py-1 rounded-lg gold-gradient text-dark-green text-xs font-bold flex items-center gap-1">
                  <Star size={10} fill="currentColor" /> FEATURED
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-3">{pkg.name}</h1>
            {pkg.description && (
              <p className="text-white/60 text-sm leading-relaxed max-w-2xl">{pkg.description}</p>
            )}
          </motion.div>
        </div>
      </section>

      <div className="bg-background min-h-screen pb-32">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 rounded-full bg-primary" />
                  Package Details
                </h2>
                <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-sm">
                  <DetailRow icon={Clock} label="Duration" value={pkg.duration || 'TBD'} />
                  {details.airline && <DetailRow icon={Plane} label="Airline" value={details.airline} />}
                  {details.departureCities && details.departureCities.length > 0 && (
                    <DetailRow icon={MapPin} label="Departure Cities" value={details.departureCities.join(', ')} />
                  )}
                  {pkg.departureDates && pkg.departureDates.length > 0 && (
                    <DetailRow icon={Calendar} label="Departure Date" value={pkg.departureDates[0]} />
                  )}
                  {details.returnDate && <DetailRow icon={Calendar} label="Return Date" value={details.returnDate} />}
                  {details.visa && <DetailRow icon={FileText} label="Visa" value={details.visa} />}
                  {details.transport && <DetailRow icon={Bus} label="Transport" value={details.transport} />}
                  {details.mealPlan && <DetailRow icon={UtensilsCrossed} label="Meals" value={details.mealPlan} />}
                  {details.roomType && <DetailRow icon={Users} label="Room Type" value={details.roomType} />}
                  {details.hotelMakkah && (
                    <DetailRow icon={Building2} label="Hotel (Makkah)" value={`${details.hotelMakkah}${details.hotelCategoryMakkah ? ` – ${details.hotelCategoryMakkah}` : ''}`} />
                  )}
                  {details.distanceMakkah && <DetailRow icon={MapPin} label="Distance (Haram)" value={details.distanceMakkah} />}
                  {details.hotelMadinah && (
                    <DetailRow icon={Building2} label="Hotel (Madinah)" value={`${details.hotelMadinah}${details.hotelCategoryMadinah ? ` – ${details.hotelCategoryMadinah}` : ''}`} />
                  )}
                  {details.distanceMadinah && <DetailRow icon={MapPin} label="Distance (Masjid Nabawi)" value={details.distanceMadinah} />}
                  <DetailRow icon={FileText} label="GST" value={`${pkg.gstPercent}% (excluded)`} />
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 rounded-full bg-accent" />
                  Room Pricing
                </h2>
                <div className="bg-white rounded-2xl border border-border/60 overflow-hidden shadow-sm">
                  {[
                    { label: "Quad Sharing (4 persons)", mult: 1 },
                    { label: "Triple Sharing (3 persons)", mult: 1.15 },
                    { label: "Double Sharing (2 persons)", mult: 1.3 },
                  ].map((room, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-4 border-b border-border/40 last:border-b-0 hover:bg-muted/30 transition-colors">
                      <span className="text-muted-foreground text-sm">{room.label}</span>
                      <span className="font-bold text-primary text-base">{formatCurrency(Math.round(pkg.pricePerPerson * room.mult))}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {pkg.includes && pkg.includes.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full bg-emerald-500" />
                    Inclusions
                  </h2>
                  <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pkg.includes.map((inc, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Check size={11} className="text-emerald-600" strokeWidth={3} />
                          </div>
                          <span className="text-foreground text-sm">{inc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {pkg.highlights && pkg.highlights.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                  <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                    <div className="w-1 h-6 rounded-full bg-amber-500" />
                    Highlights
                  </h2>
                  <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-sm space-y-3">
                    {pkg.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5 text-accent font-bold text-xs">
                          {i + 1}
                        </div>
                        <span className="text-foreground text-sm">{h}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              <ItineraryAccordion type={pkg.type} duration={pkg.duration} />

              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <h2 className="font-bold text-foreground text-lg mb-4 flex items-center gap-2">
                  <div className="w-1 h-6 rounded-full bg-red-400" />
                  Exclusions
                </h2>
                <div className="bg-white rounded-2xl border border-border/60 p-5 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {exclusions.map((exc, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                          <X size={11} className="text-red-500" strokeWidth={3} />
                        </div>
                        <span className="text-foreground text-sm">{exc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-28 space-y-5">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <div className="bg-white rounded-2xl border border-border/60 p-6 shadow-lg shadow-black/[0.04]">
                    <div className="text-center mb-5">
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Starting from</p>
                      <p className="text-4xl font-bold text-primary">{formatCurrency(pkg.pricePerPerson)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        per person + {pkg.gstPercent}% GST
                        {details.airline && <span className="ml-1">| {details.airline}</span>}
                      </p>
                      {(details.hotelCategoryMakkah || details.hotelCategoryMadinah) && (
                        <div className="flex gap-1.5 mt-3 justify-center">
                          {details.hotelCategoryMakkah && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">
                              {'★'} {details.hotelCategoryMakkah}
                            </span>
                          )}
                          {details.hotelCategoryMadinah && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">
                              {'★'} {details.hotelCategoryMadinah}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 mb-6">
                      {pkg.duration && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Clock size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="ml-auto font-medium">{pkg.duration}</span>
                        </div>
                      )}
                      {pkg.departureDates && pkg.departureDates.length > 0 && (
                        <div className="flex items-center gap-2.5 text-sm">
                          <Calendar size={14} className="text-muted-foreground" />
                          <span className="text-muted-foreground">Departure:</span>
                          <span className="ml-auto font-medium">{pkg.departureDates[0]}</span>
                        </div>
                      )}
                    </div>

                    {renderCTAButton()}

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={handleWhatsAppShare}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366]/10 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors"
                      >
                        <Phone size={15} />
                        WhatsApp
                      </button>
                      <button
                        onClick={handleShare}
                        className="w-12 h-12 rounded-xl border border-border bg-muted/30 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <Share2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>

                <div className="bg-primary/5 rounded-2xl border border-primary/10 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield size={16} className="text-primary" />
                    <span className="text-sm font-semibold text-primary">Trust & Safety</span>
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2"><Check size={12} className="text-primary" /> Government Licensed Operator</li>
                    <li className="flex items-center gap-2"><Check size={12} className="text-primary" /> 35+ Years of Experience</li>
                    <li className="flex items-center gap-2"><Check size={12} className="text-primary" /> 24/7 Customer Support</li>
                    <li className="flex items-center gap-2"><Check size={12} className="text-primary" /> Secure Payment Gateway</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-border px-4 py-3 flex items-center justify-between shadow-2xl lg:hidden">
        <div>
          <p className="text-muted-foreground text-xs">Starting from</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(pkg.pricePerPerson)}</p>
          <p className="text-xs text-muted-foreground">+ {pkg.gstPercent}% GST</p>
        </div>

        {approvedBooking ? (
          <button
            onClick={handlePayNow}
            disabled={isPaymentLoading}
            className="px-8 py-3 gold-gradient text-dark-green font-bold rounded-xl text-base shadow-lg flex items-center gap-2 disabled:opacity-60"
          >
            <CreditCard size={16} />
            {isPaymentLoading ? "..." : "Pay Now"}
          </button>
        ) : pendingBooking ? (
          <button disabled className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl text-sm opacity-80 cursor-not-allowed">
            Pending
          </button>
        ) : (
          <button
            onClick={handleBookNow}
            className="px-8 py-3 bg-primary text-white font-bold rounded-xl text-base shadow-lg hover:bg-primary/90 transition-colors"
          >
            {!isAuthenticated ? "Login" : "Book Now"}
          </button>
        )}
      </div>

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
    </MainLayout>
  );
}
