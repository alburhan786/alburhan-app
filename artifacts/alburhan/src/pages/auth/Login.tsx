import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  PORTAL_REDIRECT,
  ADMIN_ROLE_REDIRECT,
  DEFAULT_ADMIN_REDIRECT,
  DEFAULT_CUSTOMER_REDIRECT,
} from "@/config/roleRedirects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, RefreshCw, CheckCircle, MessageCircle, Phone,
  User, Shield, UserCheck, Briefcase, Building2, ChevronRight,
  ChevronLeft, ArrowRight,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const RESEND_COOLDOWN = 30;
const MAX_RESENDS = 5;
const SUPPORT_PHONE = "tel:+919893225590";
const SUPPORT_DISPLAY = "+91 9893225590";
const LS_KEY = "abt_last_portal";
const FRONTEND_BUILD = "v24.1 · 2026-07-31";

type PortalType = "customer" | "admin" | "staff" | "agent" | "branch";
type Step = 0 | 1 | 2 | 3; // 0 = portal selector

interface PortalCfg {
  label: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  /** Tailwind classes for selected card state */
  ring: string;
  iconBg: string;
  iconColor: string;
  badge: string;
  error: string;
}

const PORTAL_CFG: Record<PortalType, PortalCfg> = {
  customer: {
    label: "Customer", title: "Customer Login",
    subtitle: "Track your bookings, payments & documents.",
    description: "Access your pilgrimage journey",
    icon: User,
    ring: "border-emerald-500 bg-emerald-50/60",
    iconBg: "bg-emerald-100", iconColor: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    error: "No customer account found for this mobile number.",
  },
  admin: {
    label: "Admin", title: "Admin Login",
    subtitle: "Restricted — authorised personnel only.",
    description: "ERP & CRM full access",
    icon: Shield,
    ring: "border-rose-500 bg-rose-50/60",
    iconBg: "bg-rose-100", iconColor: "text-rose-600",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    error: "This mobile number does not have admin access.",
  },
  staff: {
    label: "Staff", title: "Staff Login",
    subtitle: "Sign in to your staff account.",
    description: "Operations & field access",
    icon: UserCheck,
    ring: "border-amber-500 bg-amber-50/60",
    iconBg: "bg-amber-100", iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    error: "No active staff account found for this mobile number.",
  },
  agent: {
    label: "Agent", title: "Agent Login",
    subtitle: "Manage bookings & commissions.",
    description: "Agent dashboard access",
    icon: Briefcase,
    ring: "border-blue-500 bg-blue-50/60",
    iconBg: "bg-blue-100", iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    error: "This mobile number is not registered as an active agent.",
  },
  branch: {
    label: "Branch", title: "Branch Login",
    subtitle: "Manage your branch operations.",
    description: "Branch management portal",
    icon: Building2,
    ring: "border-indigo-500 bg-indigo-50/60",
    iconBg: "bg-indigo-100", iconColor: "text-indigo-600",
    badge: "bg-indigo-100 text-indigo-700 border-indigo-200",
    error: "No active branch account found for this mobile number.",
  },
};

const PORTAL_ORDER: PortalType[] = ["customer", "admin", "staff", "agent", "branch"];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function postJson(url: string, body: object) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("We couldn't connect to the server. Please try again.");
  }
  let data: any;
  try { data = await res.json(); } catch {
    throw new Error(
      res.status >= 500
        ? "We couldn't connect to the server. Please try again."
        : `Unexpected server response (HTTP ${res.status}). Please try again.`
    );
  }
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
}

function normaliseIndianMobile(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length > 10) return d.slice(2);
  if (d.startsWith("0") && d.length > 10) return d.slice(1);
  return d;
}

function validateMobile(mobile: string): string {
  if (!mobile.length) return "";
  if (mobile.length < 10) return "Enter a 10-digit mobile number";
  if (mobile.length > 10) return "Mobile number must be exactly 10 digits";
  if (!/^[6-9]\d{9}$/.test(mobile)) return "Invalid — Indian mobiles start with 6, 7, 8 or 9";
  return "";
}

function maskMobile(mobile: string): string {
  if (mobile.length !== 10) return mobile;
  return `${mobile.slice(0, 2)}XXXXX${mobile.slice(7)}`;
}

function getSavedPortal(): PortalType | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && PORTAL_ORDER.includes(v as PortalType)) return v as PortalType;
  } catch {}
  return null;
}

function savePortal(p: PortalType) {
  try { localStorage.setItem(LS_KEY, p); } catch {}
}

function getPortalFromUrl(): PortalType | null {
  const p = new URLSearchParams(window.location.search).get("portal");
  if (p && PORTAL_ORDER.includes(p as PortalType)) return p as PortalType;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LoginProps {
  /** When rendered at a portal-specific path (/admin/login etc.) this prop
   *  pre-selects the portal and skips the selector screen entirely.
   *  The portal is locked — the user cannot switch to another portal. */
  defaultPortal?: PortalType;
}

export default function Login({ defaultPortal }: LoginProps = {}) {
  const { updateProfile, isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Portal & step state.
  // Priority: defaultPortal (from route path) > ?portal= query param > localStorage
  const urlPortal   = getPortalFromUrl();
  const lastPortal  = getSavedPortal();
  const initialPortal = defaultPortal ?? urlPortal ?? lastPortal;
  const [portal, setPortal] = useState<PortalType | null>(initialPortal);
  const [step, setStep] = useState<Step>(() => {
    // Skip portal-selector if a specific portal is already known
    if (defaultPortal || urlPortal || lastPortal) return 1;
    return 0;
  });

  // Form state
  const [mobile, setMobile] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isNewUser, setIsNewUser] = useState(false);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [smsFailReason, setSmsFailReason] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const returnUrl = (() => {
    const r = new URLSearchParams(window.location.search).get("returnUrl");
    return r && r.startsWith("/") && !r.startsWith("//") ? r : null;
  })();

  // ── Auth redirect ─────────────────────────────────────────────────────────
  function adminRedirect(userRole: string) {
    if (PORTAL_REDIRECT[userRole]) { setLocation(PORTAL_REDIRECT[userRole]); return; }
    if (userRole === "admin" || userRole === "super_admin") {
      fetch(`${API_BASE}/api/admin-users/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(d => { const ar = d?.adminRole ?? userRole; setLocation(ADMIN_ROLE_REDIRECT[ar] ?? DEFAULT_ADMIN_REDIRECT); })
        .catch(() => setLocation(ADMIN_ROLE_REDIRECT[userRole] ?? DEFAULT_ADMIN_REDIRECT));
      return;
    }
    setLocation(returnUrl || DEFAULT_CUSTOMER_REDIRECT);
  }

  useEffect(() => {
    if (isAuthenticated && user) adminRedirect(user.role);
  }, [isAuthenticated, user]);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  if (isAuthenticated) return null;

  // ── Portal selection ──────────────────────────────────────────────────────
  function handleSelectPortal(p: PortalType) {
    setPortal(p);
    savePortal(p);
    setStep(1);
    setMobile(""); setMobileError(""); setOtp("");
    setSmsSent(null); setSmsError(null); setWhatsappSent(false); setSmsFailReason(null);
  }

  function handleChangePortal() {
    setStep(0);
    setOtp(""); setMobile(""); setMobileError("");
    setSmsSent(null); setSmsError(null); setWhatsappSent(false); setSmsFailReason(null);
    setResendCount(0); setResendCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }

  // ── Cooldown ──────────────────────────────────────────────────────────────
  function startCooldown() {
    setResendCooldown(RESEND_COOLDOWN);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  // ── OTP flow ──────────────────────────────────────────────────────────────
  function handleMobileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = normaliseIndianMobile(e.target.value).slice(0, 10);
    setMobile(n);
    if (n.length >= 3) setMobileError(validateMobile(n));
    else setMobileError("");
  }

  const sendOtp = async (mobileNum: string): Promise<boolean> => {
    const err = validateMobile(mobileNum);
    if (err) { setMobileError(err); return false; }
    if (!portal) return false;

    setIsSendingOtp(true);
    setSmsSent(null); setSmsError(null); setWhatsappSent(false); setSmsFailReason(null);

    const cleanNum = normaliseIndianMobile(mobileNum).slice(0, 10);
    try {
      const result = await postJson("/api/auth/send-otp", { mobile: cleanNum, portal });
      setIsNewUser(!!result?.isNewUser);
      setSmsSent(result?.smsSent === true);
      setWhatsappSent(result?.whatsappSent === true);
      if (result?.smsError) setSmsError(result.smsError);
      if (result?.smsFailReason) setSmsFailReason(result.smsFailReason);
      startCooldown();
      return true;
    } catch (err: any) {
      const msg = err?.message || "Failed to send OTP";
      toast({ title: msg.includes("Too many") ? "Too many requests" : "Error", description: msg, variant: "destructive" });
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
    if (otp.length < 4 || !portal) return;
    setIsVerifyingOtp(true);
    try {
      const result = await postJson("/api/auth/verify-otp", { mobile, otp, portal });
      queryClient.setQueryData(["/api/auth/me"], result.user);
      if (result?.isNewUser) { setIsNewUser(true); setStep(3); }
      else {
        toast({ title: "Welcome back!", description: `Assalamu Alaikum${result.user?.name ? `, ${result.user.name}` : ""}!` });
        adminRedirect(result.user?.role ?? "");
      }
    } catch (err: any) {
      const raw = err?.message || "Invalid OTP. Please try again.";
      // Map backend error to portal-specific message when appropriate
      const isPortalError = /access denied|not found|no account|does not have|not registered|not active|not approved/i.test(raw);
      const msg = isPortalError && portal ? PORTAL_CFG[portal].error : raw;
      let title = "Login failed";
      if (raw.includes("expired")) title = "OTP Expired";
      else if (raw.includes("already been used")) title = "OTP Already Used";
      else if (raw.includes("Too many")) title = "Too Many Attempts";
      else if (isPortalError) title = "Access Denied";
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
      const updated = await updateProfile({ name: name.trim(), email: email.trim() || undefined });
      if (updated?.role === "admin" || updated?.role === "super_admin") adminRedirect(updated.role);
      else setLocation(returnUrl || DEFAULT_CUSTOMER_REDIRECT);
    } catch { setLocation(returnUrl || DEFAULT_CUSTOMER_REDIRECT); }
    finally { setIsUpdating(false); }
  };

  const isValidMobile = mobile.length === 10 && !validateMobile(mobile);
  const cfg = portal ? PORTAL_CFG[portal] : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel (desktop only) */}
      <div className="flex-1 hidden lg:flex relative bg-primary items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/islamic-pattern-bg.png)` }} />
        <img
          src="https://pixabay.com/get/g85d6ab91c661136c9bcb738bd05f19eec5253b26e390ab6948d9d6f7802c271ce77753ae0f2c59b6921812dcf9b6a6f7bb2d10932b11db8fd166ba533481f95d_1280.jpg"
          className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30"
          alt="Medina"
        />
        <div className="relative z-10 text-center text-white px-12">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-24 h-24 mx-auto mb-8 invert" />
          <h1 className="text-5xl font-serif font-bold mb-4">Al Burhan Tours</h1>
          <p className="text-xl text-white/80 max-w-md mx-auto">
            ERP &amp; CRM — Manage every aspect of your pilgrimage operations.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 max-w-xs mx-auto text-sm text-white/70">
            {PORTAL_ORDER.map(p => {
              const c = PORTAL_CFG[p];
              const Icon = c.icon;
              return (
                <div key={p} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-white/50" />
                  <span>{c.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: login panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 sm:p-8 bg-background min-h-screen">
        {/* Back to home */}
        <a
          href="/"
          className="absolute top-6 left-6 text-sm font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Home
        </a>

        <div className={`w-full ${step === 0 ? "max-w-lg" : "max-w-md"} transition-all duration-300`}>
          {/* Card */}
          <div className="bg-card border border-border/50 rounded-3xl shadow-2xl relative overflow-hidden">
            {/* Accent bar — portal colour on steps 1+, gold gradient on step 0 */}
            <div className={`h-1.5 w-full transition-colors duration-500 ${
              step === 0
                ? "bg-gradient-to-r from-primary via-[#c8a84b] to-primary"
                : portal === "customer" ? "bg-emerald-500"
                : portal === "admin"    ? "bg-rose-500"
                : portal === "staff"    ? "bg-amber-500"
                : portal === "agent"    ? "bg-blue-500"
                : "bg-indigo-500"
            }`} />

            <div className="p-6 sm:p-8">
              {/* Step dots — shown on steps 1–3 */}
              {step > 0 && (
                <div className="flex items-center justify-center gap-2 mb-6">
                  {[1, 2, 3].map(s => (
                    <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                      s === step ? "w-8 bg-accent" : s < step ? "w-4 bg-primary" : "w-4 bg-muted"
                    }`} />
                  ))}
                </div>
              )}

              <AnimatePresence mode="wait">
                {/* ── STEP 0: Portal selector ──────────────────────────────── */}
                {step === 0 && (
                  <motion.div key="step-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                    {/* Mobile logo */}
                    <div className="flex lg:hidden justify-center mb-4">
                      <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-10 h-10" />
                    </div>
                    <div className="text-center mb-6">
                      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-1">Welcome to Al Burhan</h2>
                      <p className="text-muted-foreground text-sm">Choose your account type to continue</p>
                    </div>

                    <div className="space-y-2.5">
                      {PORTAL_ORDER.map(p => {
                        const c = PORTAL_CFG[p];
                        const Icon = c.icon;
                        const isSelected = portal === p;
                        const wasLast = lastPortal === p && !isSelected;
                        return (
                          <button
                            key={p}
                            onClick={() => handleSelectPortal(p)}
                            className={`w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border-2 text-left transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              isSelected
                                ? `${c.ring} shadow-sm`
                                : "border-border hover:border-primary/40 hover:bg-muted/50"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected ? "bg-white/70 shadow-sm" : `${c.iconBg} group-hover:opacity-90`
                            }`}>
                              <Icon className={`w-5 h-5 ${isSelected ? c.iconColor : "text-muted-foreground group-hover:text-foreground"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-foreground">{c.label} Login</span>
                                {wasLast && (
                                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Last used</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.description}</p>
                            </div>
                            <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${
                              isSelected ? c.iconColor : "text-muted-foreground group-hover:text-primary"
                            }`} />
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-center text-[10px] text-muted-foreground mt-5 opacity-60 select-none">
                      Al Burhan Tours &amp; Travels &nbsp;·&nbsp; Build {FRONTEND_BUILD}
                    </p>
                  </motion.div>
                )}

                {/* ── STEP 1: Mobile input ─────────────────────────────────── */}
                {step === 1 && cfg && (
                  <motion.div key="step-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                    {/* Change portal button */}
                    <button
                      type="button"
                      onClick={handleChangePortal}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary mb-5 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Change Account Type
                    </button>

                    <div className="mb-7 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border mb-3 ${cfg.badge}`}>
                        {(() => { const Icon = cfg.icon; return <Icon className="w-3 h-3" />; })()}
                        {cfg.label}
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-1">{cfg.title}</h2>
                      <p className="text-muted-foreground text-sm">{cfg.subtitle}</p>
                    </div>

                    <form onSubmit={handleSendOtp} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Mobile Number</label>
                        <div className="flex">
                          <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-input bg-muted text-muted-foreground font-medium text-sm">+91</span>
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
                          Works with or without +91 prefix — we'll normalise it automatically.
                        </p>
                      </div>

                      <Button
                        type="submit"
                        className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20"
                        disabled={isSendingOtp || !isValidMobile}
                      >
                        {isSendingOtp
                          ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Sending OTP…</span>
                          : <span className="flex items-center gap-2">Get OTP <ArrowRight className="w-4 h-4" /></span>
                        }
                      </Button>
                    </form>

                    <div className="mt-5 pt-4 border-t border-border/50 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="w-3.5 h-3.5" />
                      <span>Need help?</span>
                      <a href={SUPPORT_PHONE} className="text-primary font-medium hover:underline">{SUPPORT_DISPLAY}</a>
                    </div>

                    <p className="text-center text-[10px] text-muted-foreground mt-3 opacity-60 select-none">
                      Al Burhan Tours &amp; Travels &nbsp;·&nbsp; Build {FRONTEND_BUILD}
                    </p>
                  </motion.div>
                )}

                {/* ── STEP 2: OTP verify ───────────────────────────────────── */}
                {step === 2 && cfg && (
                  <motion.div key="step-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                    <div className="mb-6 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border mb-3 ${cfg.badge}`}>
                        {(() => { const Icon = cfg.icon; return <Icon className="w-3 h-3" />; })()}
                        {cfg.label}
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-1">
                        {isNewUser ? "Verify Number" : "Welcome Back"}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        OTP sent to <span className="font-semibold text-foreground">+91 {maskMobile(mobile)}</span>
                      </p>

                      {/* Delivery status */}
                      {smsSent === true && (
                        <div className="mt-2 flex items-center justify-center gap-1.5 text-emerald-600 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>OTP sent via SMS</span>
                        </div>
                      )}

                      {smsSent === false && whatsappSent && (
                        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-left flex items-start gap-2">
                          <MessageCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-emerald-800">OTP sent to your WhatsApp</p>
                            <p className="text-xs text-emerald-700 mt-0.5">Check WhatsApp for a message from Al Burhan Tours.</p>
                          </div>
                        </div>
                      )}

                      {smsSent === false && !whatsappSent && (
                        <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-2 text-left">
                          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-orange-700 font-medium">OTP delivery failed. Please try again or contact support.</p>
                        </div>
                      )}

                      {smsFailReason && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-left">
                          <p className="text-[10px] text-red-600 font-mono break-all">{smsFailReason}</p>
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <Input
                        className="h-14 text-center text-2xl tracking-[0.5em] font-mono"
                        placeholder="••••••"
                        maxLength={6}
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        type="text"
                        inputMode="numeric"
                        autoFocus
                      />
                      <Button
                        type="submit"
                        className="w-full h-12 text-base bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl shadow-lg shadow-accent/20"
                        disabled={isVerifyingOtp || otp.length < 4}
                      >
                        {isVerifyingOtp
                          ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Verifying…</span>
                          : "Verify & Continue"
                        }
                      </Button>
                    </form>

                    {/* Actions row */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 text-xs">
                      <div className="flex flex-col gap-1.5">
                        <button type="button" onClick={() => { setStep(1); setOtp(""); }}
                          className="text-muted-foreground hover:text-primary underline underline-offset-4 text-left">
                          Change Mobile Number
                        </button>
                        <button type="button" onClick={handleChangePortal}
                          className="text-muted-foreground hover:text-primary underline underline-offset-4 text-left">
                          Change Account Type
                        </button>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {resendCount < MAX_RESENDS ? (
                          <button type="button" onClick={handleResendOtp}
                            disabled={resendCooldown > 0 || isSendingOtp}
                            className="flex items-center gap-1.5 text-primary hover:text-primary/80 underline underline-offset-4 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed">
                            <RefreshCw className={`w-3.5 h-3.5 ${isSendingOtp ? "animate-spin" : ""}`} />
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">Max resends reached</span>
                        )}
                        <a href={SUPPORT_PHONE} className="flex items-center gap-1.5 text-muted-foreground hover:text-primary">
                          <Phone className="w-3.5 h-3.5" /> Contact Support
                        </a>
                      </div>
                    </div>

                    <p className="text-center text-[10px] text-muted-foreground mt-4 opacity-60 select-none">
                      Al Burhan Tours &amp; Travels &nbsp;·&nbsp; Build {FRONTEND_BUILD}
                    </p>
                  </motion.div>
                )}

                {/* ── STEP 3: Complete profile ──────────────────────────────── */}
                {step === 3 && (
                  <motion.div key="step-3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
                    <div className="mb-8 text-center">
                      <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">✨</span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-2">Complete Your Profile</h2>
                      <p className="text-muted-foreground text-sm">A warm welcome! Please tell us your name.</p>
                    </div>
                    <form onSubmit={handleCompleteProfile} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Full Name <span className="text-destructive">*</span></label>
                        <Input className="h-12" placeholder="e.g. Mohammed Ahmed Khan" value={name} onChange={e => setName(e.target.value)} autoFocus required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Email Address <span className="text-muted-foreground text-xs">(Optional)</span></label>
                        <Input className="h-12" type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                      </div>
                      <Button type="submit"
                        className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20"
                        disabled={isUpdating || !name.trim()}>
                        {isUpdating ? "Saving…" : "Start My Journey →"}
                      </Button>
                      <div className="text-center">
                        <button type="button" onClick={() => setLocation(returnUrl || DEFAULT_CUSTOMER_REDIRECT)}
                          className="text-sm text-muted-foreground hover:text-primary underline underline-offset-4">
                          Skip for now
                        </button>
                      </div>
                    </form>
                    <p className="text-center text-[10px] text-muted-foreground mt-4 opacity-60 select-none">
                      Al Burhan Tours &amp; Travels &nbsp;·&nbsp; Build {FRONTEND_BUILD}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
