import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Phone, Mail, MessageSquare, Clock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSubmitInquiry } from "@workspace/api-client-react";

export default function Contact() {
  const { toast } = useToast();
  const submitInquiry = useSubmitInquiry();
  const isSubmitting = submitInquiry.isPending;

  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    packageType: "",
    message: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await submitInquiry.mutateAsync({
        data: {
          name: formData.name,
          mobile: formData.mobile,
          email: formData.email || undefined,
          message: formData.message,
          packageInterest: formData.packageType || undefined,
        }
      });
      toast({
        title: "Inquiry Sent Successfully",
        description: "Our team will contact you shortly.",
      });
      setFormData({ name: "", mobile: "", email: "", packageType: "", message: "" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to send inquiry. Please try WhatsApp.",
        variant: "destructive"
      });
    }
  };

  return (
    <MainLayout>
      <div className="bg-primary pt-24 pb-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <div className="relative z-10 px-4">
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-6">Contact Us</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">We are always ready to assist you with your Hajj, Umrah, and Ziyarat travel arrangements.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-20 relative z-20 mb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Contact Form */}
          <Card className="lg:col-span-2 shadow-xl border-border/50">
            <CardContent className="p-8">
              <h2 className="text-2xl font-serif font-bold text-primary mb-6 flex items-center gap-2">
                <MessageSquare className="text-accent" /> Send us a message
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Ahmed Khan"
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile Number</Label>
                    <Input
                      id="mobile"
                      placeholder="+91..."
                      required
                      value={formData.mobile}
                      onChange={e => setFormData({...formData, mobile: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address (Optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="package">Interested In</Label>
                    <Select value={formData.packageType} onValueChange={v => setFormData({...formData, packageType: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a package type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hajj">Hajj</SelectItem>
                        <SelectItem value="umrah">Umrah</SelectItem>
                        <SelectItem value="ramadan_umrah">Ramadan Umrah</SelectItem>
                        <SelectItem value="iraq_ziyarat">Iraq Ziyarat</SelectItem>
                        <SelectItem value="jerusalem">Baitul Muqaddas (Jerusalem)</SelectItem>
                        <SelectItem value="other">Other Inquiry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="How can we help you with your sacred journey?"
                    rows={5}
                    required
                    value={formData.message}
                    onChange={e => setFormData({...formData, message: e.target.value})}
                  />
                </div>

                <Button type="submit" className="w-full md:w-auto px-8" disabled={isSubmitting}>
                  {isSubmitting ? "Sending..." : "Submit Inquiry"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card className="shadow-xl border-border/50 bg-primary text-white">
              <CardContent className="p-8 space-y-6">
                <h3 className="text-xl font-serif font-bold text-accent">Contact Information</h3>

                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full shrink-0"><MapPin className="text-accent w-5 h-5" /></div>
                    <div>
                      <p className="text-sm text-white/70 mb-1">Office Address</p>
                      <p className="font-semibold leading-relaxed text-sm">
                        5/8 Khanka Masjid Complex<br />
                        Shanwara Road, Burhanpur<br />
                        Madhya Pradesh – 450331, India
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full shrink-0"><Phone className="text-accent w-5 h-5" /></div>
                    <div>
                      <p className="text-sm text-white/70 mb-1">Phone / WhatsApp</p>
                      <p className="font-semibold">+91 9893989786</p>
                      <p className="font-semibold">+91 8989701701</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full shrink-0"><Mail className="text-accent w-5 h-5" /></div>
                    <div>
                      <p className="text-sm text-white/70 mb-1">Email</p>
                      <p className="font-semibold text-sm">info@alburhantravels.com</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-white/10 p-3 rounded-full shrink-0"><Clock className="text-accent w-5 h-5" /></div>
                    <div>
                      <p className="text-sm text-white/70 mb-1">Office Hours</p>
                      <p className="font-semibold text-sm">Monday – Saturday</p>
                      <p className="text-sm text-white/80">10:00 AM – 8:00 PM</p>
                      <p className="font-semibold text-sm mt-1">Sunday</p>
                      <p className="text-sm text-white/80">By appointment only</p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/20">
                  <p className="text-sm text-white/70 mb-3">You can also contact us through WhatsApp for quick assistance.</p>
                  <a href="https://wa.me/919893989786" target="_blank" rel="noreferrer" className="block w-full">
                    <Button className="w-full bg-[#25D366] hover:bg-[#25D366]/90 text-white font-bold py-6">
                      Chat on WhatsApp
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden shadow-xl border-border/50 h-60">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14847.123456789!2d76.2285!3d21.3086!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bd7c8b9b0b0b0b1%3A0x1234567890abcdef!2sBurhanpur%2C%20Madhya%20Pradesh%20450331!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen={false}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Al Burhan Tours & Travels — Burhanpur Office"
              />
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
