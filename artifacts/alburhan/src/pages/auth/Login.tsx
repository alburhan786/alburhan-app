import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, RefreshCw, CheckCircle, MessageCircle, Phone } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const RESEND_COOLDOWN = 30;
const MAX_RESENDS = 5;

async function postJson(url: string, body: object) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("We couldn't connect to the server. Please try again.");
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    // Server returned HTML (e.g. 502 Bad Gateway) instead of JSON
    throw new Error(
      res.status >= 500
        ? "We couldn't connect to the server. Please try again."
        : `Unexpected server response (HTTP ${res.status}). Please try again.`
    );
  }
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

/**
 * Normalise any Indian mobile input to exactly 10 digits.
 * Accepts:  9876543210  |  +919876543210  |  919876543210  |  09876543210
 * Returns:  "9876543210" (10 digits) or "" if unrecognisable.
 */
function normaliseIndianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) return digits.slice(2);
  if (digits.startsWith("0") && digits.length > 10) return digits.slice(1);
  return digits;
}

/** Returns an error string or "" if valid. */
function validateMobile(mobile: string): string {
  if (mobile.length === 0) return "";
  if (mobile.length < 10) return "Enter a 10-digit mobile number";
  if (mobile.length > 10) return "Mobile number must be exactly 10 digits";
  if (!/^[6-9]\d{9}$/.test(mobile)) return "Invalid number — Indian mobiles start with 6, 7, 8, or 9";
  return "";
}

const FRONTEND_BUILD = "v24.0 · 2026-07-20";

export default function Login() {
  const { updateProfile, isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mobile, setMobile] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isNewUser, setIsNewUser] = useState(false);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [whatsappSent, setWhatsappSent] = useState<boolean>(false);
  const [smsFailReason, setSmsFailReason] = useState<string | null>(null);
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

  // Redirect to role-appropriate portal after login
  function adminRedirect(userRole: string) {
    if (userRole === "branch_manager") { setLocation("/branch/dashboard"); return; }
    if (userRole === "agent")          { setLocation("/agent/dashboard"); return; }
    if (userRole === "staff")          { setLocation("/staff/dashboard"); return; }
    if (userRole === "admin" || userRole === "super_admin") {
      fetch(`${API_BASE}/api/admin-users/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const adminRole: string = data?.adminRole ?? "";
          if (adminRole === "super_admin" || userRole === "super_admin") { setLocation("/admin/super"); return; }
          if (adminRole === "accounts")   { setLocation("/admin/finance"); return; }
          if (adminRole === "operations") { setLocation("/admin/operations"); return; }
          if (adminRole === "sales")      { setLocation("/admin/customers"); return; }
          if (adminRole === "guide")      { setLocation("/admin/guide-panel"); return; }
          setLocation("/admin/dashboard");
        })
        .catch(() => setLocation(userRole === "super_admin" ? "/admin/super" : "/admin/dashboard"));
      return;
    }
    setLocation(returnUrl || "/customer/dashboard");
  }

  useEffect(() => {
    if (isAuthenticated && user) adminRedirect(user.role);
  }, [isAuthenticated, user]);

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

  function handleMobileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const normalised = normaliseIndianMobile(e.target.value).slice(0, 10);
    setMobile(normalised);
    // Validate only once 3+ digits typed (avoid premature red)
    if (normalised.length >= 3) {
      setMobileError(validateMobile(normalised));
    } else {
      setMobileError("");
    }
  }

  const sendOtp = async (mobileNum: string) => {
    const err = validateMobile(mobileNum);
    if (err) {
      setMobileError(err);
      return false;
    }

    setIsSendingOtp(true);
    setSmsSent(null);
    setSmsError(null);
    setWhatsappSent(false);
    setSmsFailReason(null);

    // Always send the clean 10-digit number (backend will also normalise, but be explicit)
    const cleanNum = normaliseIndianMobile(mobileNum).slice(0, 10);
    console.log(`[Login] Sending OTP request for mobile: ${cleanNum} (E.164: +91${cleanNum})`);

    try {
      const result = await postJson("/api/auth/send-otp", { mobile: cleanNum });
      console.log("[Login] send-otp response:", result);
      setIsNewUser(!!result?.isNewUser);
      setSmsSent(result?.smsSent === true);
      setWhatsappSent(result?.whatsappSent === true);
      if (result?.smsError) setSmsError(result.smsError);
      if (result?.smsFailReason) setSmsFailReason(result.smsFailReason);
      if (result?.debugOtp) setDebugOtp(result.debugOtp);
      startCooldown();
      return true;
    } catch (err: any) {
      const msg = err?.message || "Failed to send OTP";
      console.error("[Login] send-otp error:", msg);
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
    const err = validateMobile(mobile);
    if (err) { setMobileError(err); return; }
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
    console.log(`[Login] Verifying OTP for mobile: ${mobile} (E.164: +91${mobile})`);
    try {
      const result = await postJson("/api/auth/verify-otp", { mobile, otp });
      console.log("[Login] verify-otp response:", { ok: true, user: result?.user?.mobile });
      queryClient.setQueryData(["/api/auth/me"], result.user);
      if (result?.isNewUser) {
        setIsNewUser(true);
        setStep(3);
      } else {
        toast({
          title: "Welcome back!",
          description: `Assalamu Alaikum${result.user?.name ? `, ${result.user.name}` : ""}! You have logged in.`,
        });
        adminRedirect(result.user?.role ?? "");
      }
    } catch (err: any) {
      const msg = err?.message || "Invalid OTP. Please try again.";
      console.error("[Login] verify-otp error:", msg);
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

  const isValidMobile = mobile.length === 10 && !validateMobile(mobile);

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
                        className={`rounded-l-none h-12 text-lg ${mobileError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        placeholder="9XXXXXXXXX"
                        value={mobile}
                        onChange={handleMobileChange}
                        type="text"
                        inputMode="numeric"
                        autoFocus
                        maxLength={10}
                        autoComplete="tel-national"
                      />
                    </div>
                    {mobileError && (
                      <div className="flex items-center gap-1.5 text-destructive text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{mobileError}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Works with or without +91 prefix &mdash; we'll normalise it automatically.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20"
                    disabled={isSendingOtp || !isValidMobile}
                  >
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
                      <span>OTP sent via SMS</span>
                    </div>
                  )}

                  {/* SMS failed — WhatsApp delivered */}
                  {smsSent === false && whatsappSent && !debugOtp && (
                    <div className="mt-3 space-y-2">
                      <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-start gap-2">
                        <MessageCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                        <div className="text-left">
                          <p className="text-xs font-semibold text-green-800">OTP sent to your WhatsApp</p>
                          <p className="text-xs text-green-700 mt-0.5">Open WhatsApp and check for a message from Al Burhan Tours with your OTP code.</p>
                        </div>
                      </div>
                      {smsFailReason && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-left">
                          <p className="text-[10px] font-semibold text-red-700 mb-0.5">Fast2SMS Error:</p>
                          <p className="text-[10px] text-red-600 font-mono break-all">{smsFailReason}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SMS failed — no WhatsApp either */}
                  {smsSent === false && !whatsappSent && !debugOtp && (
                    <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-orange-700 text-left font-medium">OTP delivery failed. Please try again or contact support.</p>
                      </div>
                      {smsFailReason && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-left">
                          <p className="text-[10px] font-semibold text-red-700 mb-0.5">Fast2SMS Error:</p>
                          <p className="text-[10px] text-red-600 font-mono break-all">{smsFailReason}</p>
                        </div>
                      )}
                      <a href="tel:+918989701701" className="flex items-center gap-1.5 text-xs text-orange-700 font-semibold hover:text-orange-900">
                        <Phone className="w-3.5 h-3.5" /> +91 8989701701
                      </a>
                    </div>
                  )}

                  {/* Admin debug OTP */}
                  {debugOtp && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-xs text-amber-700 font-medium mb-1">⚠️ Admin debug — your OTP:</p>
                      <p className="text-2xl font-mono font-bold text-amber-800 tracking-widest">{debugOtp}</p>
                      {smsError && <p className="text-xs text-red-600 mt-1 font-mono break-all">SMS: {smsError}</p>}
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
                      inputMode="numeric"
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
          <p className="text-center text-[10px] text-muted-foreground mt-4 opacity-60 select-none">
            Al Burhan Tours &amp; Travels &nbsp;·&nbsp; Build {FRONTEND_BUILD}
          </p>
        </Card>
      </div>
    </div>
  );
}
