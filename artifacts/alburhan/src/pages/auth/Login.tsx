import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const RESEND_COOLDOWN = 30;
const MAX_RESENDS = 5;

async function postJson(url: string, body: object) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

export default function Login() {
  const { updateProfile, isAuthenticated, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isNewUser, setIsNewUser] = useState(false);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const rawReturnUrl = searchParams.get("returnUrl");
  const returnUrl = rawReturnUrl && rawReturnUrl.startsWith("/") && !rawReturnUrl.startsWith("//") ? rawReturnUrl : null;

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(isAdmin ? "/admin/dashboard" : (returnUrl || "/customer/dashboard"));
    }
  }, [isAuthenticated, isAdmin, setLocation]);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  if (isAuthenticated) return null;

  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  const sendOtp = async (mobileNum: string) => {
    setIsSendingOtp(true);
    setSmsSent(null);
    setSmsError(null);
    try {
      const result = await postJson("/api/auth/send-otp", { mobile: mobileNum });
      setIsNewUser(!!result?.isNewUser);
      setSmsSent(result?.smsSent !== false);
      if (result?.smsError) setSmsError(result.smsError);
      if (result?.debugOtp) setDebugOtp(result.debugOtp);
      startCooldown();
      return true;
    } catch (err: any) {
      const msg = err?.message || "Failed to send OTP";
      if (msg.includes("Too many")) {
        toast({ title: "Too many requests", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
      return false;
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mobile.length < 10) return;
    const ok = await sendOtp(mobile);
    if (ok) setStep(2);
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendCount >= MAX_RESENDS) return;
    setResendCount(c => c + 1);
    await sendOtp(mobile);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    setIsVerifyingOtp(true);
    try {
      const result = await postJson("/api/auth/verify-otp", { mobile, otp });
      queryClient.setQueryData(["/api/auth/me"], result.user);
      if (result?.isNewUser) {
        setIsNewUser(true);
        setStep(3);
      } else {
        toast({
          title: "Welcome back!",
          description: `Assalamu Alaikum${result.user?.name ? `, ${result.user.name}` : ""}! You have logged in.`,
        });
        setLocation(result.user?.role === "admin" ? "/admin/dashboard" : (returnUrl || "/customer/dashboard"));
      }
    } catch (err: any) {
      const msg = err?.message || "Invalid OTP. Please try again.";
      let title = "Login failed";
      if (msg.includes("expired")) title = "OTP Expired";
      else if (msg.includes("already been used")) title = "OTP Already Used";
      else if (msg.includes("Too many")) title = "Too Many Attempts";
      toast({ title, description: msg, variant: "destructive" });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsUpdating(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() || undefined });
      setLocation(returnUrl || "/customer/dashboard");
    } catch {
      setLocation(returnUrl || "/customer/dashboard");
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

          <div className="flex items-center justify-center gap-2 mb-8">
            {[1,2,3].map(s => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-8 bg-accent' : s < step ? 'w-4 bg-primary' : 'w-4 bg-muted'}`} />
            ))}
          </div>

          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
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
                      <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-input bg-muted text-muted-foreground font-medium">+91</span>
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
                <div className="mb-6 text-center">
                  <h2 className="text-3xl font-serif font-bold text-foreground mb-2">
                    {isNewUser ? "Verify Number" : "Welcome Back"}
                  </h2>
                  <p className="text-muted-foreground text-sm">OTP sent to <span className="font-medium text-primary">+91 {mobile}</span></p>

                  {/* SMS status indicator */}
                  {smsSent === true && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-green-600 text-xs">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>SMS sent successfully</span>
                    </div>
                  )}
                  {smsSent === false && !debugOtp && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-orange-700 text-left">SMS could not be delivered. Check WhatsApp or contact <strong>+91 8989701701</strong> for your OTP.</p>
                    </div>
                  )}

                  {/* Admin debug OTP */}
                  {debugOtp && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Admin debug — your OTP:</p>
                      <p className="text-2xl font-mono font-bold text-amber-800 tracking-widest">{debugOtp}</p>
                      {smsError && <p className="text-xs text-red-600 mt-1">SMS error: {smsError}</p>}
                    </div>
                  )}
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
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

                  {/* Resend OTP */}
                  <div className="flex items-center justify-between text-sm">
                    <button type="button" onClick={() => { setStep(1); setOtp(""); }} className="text-muted-foreground hover:text-primary underline underline-offset-4">
                      Change Number
                    </button>
                    {resendCount < MAX_RESENDS ? (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0 || isSendingOtp}
                        className="flex items-center gap-1.5 text-primary hover:text-primary/80 underline underline-offset-4 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSendingOtp ? 'animate-spin' : ''}`} />
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">Max resends reached</span>
                    )}
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
                    <Input className="h-12" placeholder="e.g. Mohammed Ahmed Khan" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email Address <span className="text-muted-foreground text-xs">(Optional)</span></label>
                    <Input className="h-12" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20" disabled={isUpdating || !name.trim()}>
                    {isUpdating ? "Saving..." : "Start My Journey →"}
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => setLocation(returnUrl || "/customer/dashboard")} className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4">
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
