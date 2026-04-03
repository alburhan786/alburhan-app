import { MainLayout } from "@/components/layout/MainLayout";
import { MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LiveChat() {
  return (
    <MainLayout>
      <section className="py-20 min-h-[60vh]">
        <div className="container mx-auto px-4 text-center">
          <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-[#25D366]/10 flex items-center justify-center">
            <MessageCircle className="w-10 h-10 text-[#25D366]" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-primary mb-4">Live Chat Support</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8 text-lg">
            Connect with our travel experts instantly. Get answers to your questions about Hajj, Umrah, and Ziyarat packages in real time.
          </p>

          <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-6 py-3 rounded-full text-sm font-medium mb-12">
            <Clock className="w-4 h-4" />
            In-app live chat coming soon
          </div>

          <div className="max-w-lg mx-auto">
            <p className="text-muted-foreground mb-6">In the meantime, reach us directly on WhatsApp for instant support:</p>
            <a href="https://wa.me/918989701701" target="_blank" rel="noreferrer">
              <Button size="lg" className="bg-[#25D366] hover:bg-[#25D366]/90 text-white rounded-full px-8 py-6 text-lg font-bold shadow-xl hover:scale-105 transition-transform">
                <MessageCircle className="w-5 h-5 mr-2" />
                Chat on WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}
