import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

export default function Login() {
  const { sendOtp, isSendingOtp, verifyOtp, isVerifyingOtp, isAuthenticated, isAdmin } = useAuth();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [, setLocation] = useLocation();

  if (isAuthenticated) {
    setLocation(isAdmin ? "/admin/dashboard" : "/customer/dashboard");
    return null;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile.length < 10) return;
    try {
      await sendOtp({ data: { mobile } });
      setStep(2);
    } catch (error) {
      // Error handled by hook toast
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    try {
      await verifyOtp({ data: { mobile, otp } });
    } catch (error) {
      // Error handled by hook
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 hidden lg:flex relative bg-primary items-center justify-center">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        {/* stock image abstract peaceful scene */}
        <img src="https://pixabay.com/get/g85d6ab91c661136c9bcb738bd05f19eec5253b26e390ab6948d9d6f7802c271ce77753ae0f2c59b6921812dcf9b6a6f7bb2d10932b11db8fd166ba533481f95d_1280.jpg" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" alt="Medina" />
        <div className="relative z-10 text-center text-white px-12">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-24 h-24 mx-auto mb-8 invert" />
          <h1 className="text-5xl font-serif font-bold mb-4 text-shadow">Al Burhan Tours</h1>
          <p className="text-xl text-white/80 max-w-md mx-auto">Access your bookings, track payments, and manage your spiritual journey.</p>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <Link href="/" className="absolute top-8 left-8 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          &larr; Back to Home
        </Link>
        
        <Card className="w-full max-w-md p-8 md:p-10 shadow-2xl border-border/50 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />
          
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Welcome Back</h2>
            <p className="text-muted-foreground">Login securely with your mobile number.</p>
          </div>

          <motion.div 
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {step === 1 ? (
              <form onSubmit={handleSendOtp} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mobile Number</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-input bg-muted text-muted-foreground">
                      +91
                    </span>
                    <Input 
                      className="rounded-l-none h-12 text-lg" 
                      placeholder="98765 43210" 
                      value={mobile} 
                      onChange={(e) => setMobile(e.target.value)}
                      type="tel"
                      autoFocus
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20" disabled={isSendingOtp || mobile.length < 10}>
                  {isSendingOtp ? "Sending OTP..." : "Get OTP"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="space-y-2 text-center">
                  <label className="text-sm font-medium">Enter OTP sent to +91 {mobile}</label>
                  <Input 
                    className="h-14 text-center text-2xl tracking-[0.5em] font-mono" 
                    placeholder="••••" 
                    maxLength={6}
                    value={otp} 
                    onChange={(e) => setOtp(e.target.value)}
                    type="text"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-lg bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shadow-lg shadow-accent/20" disabled={isVerifyingOtp || otp.length < 4}>
                  {isVerifyingOtp ? "Verifying..." : "Verify & Login"}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4">
                    Change Mobile Number
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </Card>
      </div>
    </div>
  );
}
