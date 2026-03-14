import { MainLayout } from "@/components/layout/MainLayout";
import { Building2, MapPin, Star } from "lucide-react";

export default function Hotels() {
  return (
    <MainLayout>
      <section className="py-20 min-h-[60vh]">
        <div className="container mx-auto px-4 text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-primary mb-4">Hotels & Accommodation</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-12 text-lg">
            View your assigned hotel details for Makkah and Madinah. Hotel assignments will be visible here once your booking is confirmed.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-border/50 text-left">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Star className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg">Makkah Hotels</h3>
                  <p className="text-sm text-muted-foreground">Near Haram Sharif</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                We partner with premium hotels close to the Haram in Makkah. Hotel details including name, distance, and room type will appear in your booking confirmation.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg border border-border/50 text-left">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg">Madinah Hotels</h3>
                  <p className="text-sm text-muted-foreground">Near Masjid Nabawi</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                Our Madinah accommodations are carefully selected for proximity to Masjid Nabawi. Your hotel address will be shared once your booking is finalized.
              </p>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
