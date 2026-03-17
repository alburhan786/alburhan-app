import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

export default function Login() {
  const { sendOtp, isSendingOtp, verifyOtp, isVerifyingOtp, updateProfile, isAuthenticated, isAdmin } = useAuth();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(isAdmin ? "/admin/dashboard" : "/customer/dashboard");
    }
  }, [isAuthenticated, isAdmin, setLocation]);

  if (isAuthenticated) {
    return null;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile.length < 10) return;
    try {
      const result = await sendOtp({ data: { mobile } });
      setIsNewUser(!!(result as any)?.isNewUser);
      setStep(2);
    } catch {
      // Error handled by hook toast
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    try {
      const result = await verifyOtp({ data: { mobile, otp } });
      if ((result as any)?.isNewUser) {
        setIsNewUser(true);
        setStep(3);
      }
      // If not new user, use-auth hook handles redirect
    } catch {
      // Error handled by hook
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsUpdating(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() || undefined });
      setLocation("/customer/dashboard");
    } catch {
      setLocation("/customer/dashboard");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 hidden lg:flex relative bg-primary items-center justify-center">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <img src="https://pixabay.com/get/g85d6ab91c661136c9bcb738bd05f19eec5253b26e390ab6948d9d6f7802c271ce77753ae0f2c59b6921812dcf9b6a6f7bb2d10932b11db8fd166ba533481f95d_1280.jpg" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" alt="Medina" />
        <div className="relative z-10 text-center text-white px-12">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-24 h-24 mx-auto mb-8 invert" />
          <h1 className="text-5xl font-serif font-bold mb-4">Al Burhan Tours</h1>
          <p className="text-xl text-white/80 max-w-md mx-auto">Access your bookings, track payments, and manage your sacred journey.</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <Link href="/" className="absolute top-8 left-8 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          &larr; Back to Home
        </Link>

        <Card className="w-full max-w-md p-8 md:p-10 shadow-2xl border-border/50 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary" />

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {[1,2,3].map(s => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-8 bg-accent' : s < step ? 'w-4 bg-primary' : 'w-4 bg-muted'}`} />
            ))}
          </div>

          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {step === 1 && (
              <>
                <div className="mb-8 text-center">
                  <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Welcome</h2>
                  <p className="text-muted-foreground">Enter your mobile number to continue.</p>
                </div>
                <form onSubmit={handleSendOtp} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mobile Number</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-input bg-muted text-muted-foreground font-medium">
                        +91
                      </span>
                      <Input
                        className="rounded-l-none h-12 text-lg"
                        placeholder="9XXXXXXXXX"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        type="tel"
                        autoFocus
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20" disabled={isSendingOtp || mobile.length < 10}>
                    {isSendingOtp ? "Sending OTP..." : "Get OTP"}
                  </Button>
                </form>
              </>
            )}

            {step === 2 && (
              <>
                <div className="mb-8 text-center">
                  <h2 className="text-3xl font-serif font-bold text-foreground mb-2">
                    {isNewUser ? "Verify Number" : "Welcome Back"}
                  </h2>
                  <p className="text-muted-foreground text-sm">OTP sent to <span className="font-medium text-primary">+91 {mobile}</span></p>
                </div>
                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="space-y-2 text-center">
                    <Input
                      className="h-14 text-center text-2xl tracking-[0.5em] font-mono"
                      placeholder="••••••"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      type="text"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 text-lg bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shadow-lg shadow-accent/20" disabled={isVerifyingOtp || otp.length < 4}>
                    {isVerifyingOtp ? "Verifying..." : "Verify & Continue"}
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4">
                      Change Mobile Number
                    </button>
                  </div>
                </form>
              </>
            )}

            {step === 3 && (
              <>
                <div className="mb-8 text-center">
                  <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✨</span>
                  </div>
                  <h2 className="text-3xl font-serif font-bold text-foreground mb-2">Complete Your Profile</h2>
                  <p className="text-muted-foreground text-sm">A warm welcome! Please tell us your name.</p>
                </div>
                <form onSubmit={handleCompleteProfile} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Full Name <span className="text-destructive">*</span></label>
                    <Input
                      className="h-12"
                      placeholder="e.g. Mohammed Ahmed Khan"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email Address <span className="text-muted-foreground text-xs">(Optional)</span></label>
                    <Input
                      className="h-12"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20" disabled={isUpdating || !name.trim()}>
                    {isUpdating ? "Saving..." : "Start My Journey →"}
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => setLocation("/customer/dashboard")} className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4">
                      Skip for now
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </Card>
      </div>
    </div>
  );
}
