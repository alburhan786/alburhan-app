import { useState, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { Star, CheckCircle, Send, Smartphone, RotateCcw } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const BASE = import.meta.env.BASE_URL || "/";

const CATEGORIES = [
  { key: "ratingAccommodationMakkah1", label: "Accommodation — Makkah (Aziziah)", labelUr: "رہائش — مکہ (عزیزیہ)" },
  { key: "ratingAccommodationMakkah2", label: "Accommodation — Makkah 2", labelUr: "رہائش — مکہ 2" },
  { key: "ratingAccommodationMadinah", label: "Accommodation — Madinah", labelUr: "رہائش — مدینہ" },
  { key: "ratingTransportation", label: "Transportation", labelUr: "نقل و حمل" },
  { key: "ratingFood", label: "Food & Meals", labelUr: "کھانا پینا" },
  { key: "ratingGuide", label: "Guide / Tour Leader", labelUr: "گائیڈ / ٹور لیڈر" },
  { key: "ratingVisaDocumentation", label: "Visa & Documentation", labelUr: "ویزہ اور دستاویزات" },
  { key: "ratingOverall", label: "Overall Experience", labelUr: "مجموعی تجربہ" },
];

type Step = "mobile" | "otp" | "form" | "done";

interface PilgrimInfo {
  mobile: string;
  pilgrimName: string | null;
  bookingId: string | null;
  companyId: string | null;
  groupId: string | null;
  groupName: string | null;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-2 mt-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="focus:outline-none transition-transform active:scale-90"
          style={{ fontSize: 32, lineHeight: 1 }}
        >
          <span style={{ color: n <= (hovered || value) ? "#F59E0B" : "#D1D5DB" }}>★</span>
        </button>
      ))}
      {value > 0 && (
        <span className="text-sm text-gray-500 self-center ml-1">
          {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const bookingIdParam = params.get("booking_id") || "";

  const [step, setStep] = useState<Step>("mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [pilgrimInfo, setPilgrimInfo] = useState<PilgrimInfo | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [whatLiked, setWhatLiked] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [recommend, setRecommend] = useState<"yes" | "maybe" | "no" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const otpInputs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const cleanMobile = (m: string) => m.replace(/\D/g, "").slice(-10);

  async function handleSendOtp() {
    const cleaned = cleanMobile(mobile);
    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/feedback/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: cleaned }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Failed to send OTP");
      setStep("otp");
      setResendTimer(60);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    const otpVal = otp.join("");
    if (otpVal.length !== 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/feedback/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: cleanMobile(mobile), otp: otpVal }),
      });
      const data = await r.json();
      if (!r.ok || !data.verified) throw new Error(data.message || "Invalid OTP");
      setPilgrimInfo(data);
      if (bookingIdParam && !data.bookingId) {
        data.bookingId = bookingIdParam;
      }
      setStep("form");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ratings.ratingOverall) {
      setError("Please provide an overall rating.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/feedback/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: cleanMobile(mobile),
          pilgrimName: pilgrimInfo?.pilgrimName || null,
          bookingId: pilgrimInfo?.bookingId || bookingIdParam || null,
          companyId: pilgrimInfo?.companyId || null,
          groupId: pilgrimInfo?.groupId || null,
          groupName: pilgrimInfo?.groupName || null,
          ...ratings,
          comment,
          whatDidYouLike: whatLiked,
          suggestions,
          wouldRecommend: recommend || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Failed to submit");
      setStep("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOtpInput(idx: number, val: string) {
    const digits = val.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = digits.split("").slice(0, 6);
      const newOtp = [...otp];
      next.forEach((d, i) => { if (idx + i < 6) newOtp[idx + i] = d; });
      setOtp(newOtp);
      const focusIdx = Math.min(idx + next.length, 5);
      otpInputs.current[focusIdx]?.focus();
      return;
    }
    const newOtp = [...otp];
    newOtp[idx] = digits;
    setOtp(newOtp);
    if (digits && idx < 5) otpInputs.current[idx + 1]?.focus();
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0A3D2A 0%, #1a5c3a 100%)" }}>
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <img
            src={`${BASE}images/logo.png`}
            alt="Al Burhan"
            className="w-16 h-16 object-contain mx-auto mb-3 brightness-0 invert opacity-90"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <h1 className="text-2xl font-bold text-white">Al Burhan Tours & Travels</h1>
          <p className="text-white/70 text-sm mt-1">آپ کا تجربہ ہمارے لیے اہم ہے</p>
          <p className="text-white/70 text-sm">Your feedback matters to us</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {step === "mobile" && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Smartphone size={20} className="text-green-700" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Verify Your Mobile</h2>
                  <p className="text-sm text-gray-500">اپنا موبائل نمبر درج کریں</p>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mobile Number / موبائل نمبر
                </label>
                <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-green-600 transition-colors">
                  <span className="bg-gray-50 px-4 py-4 text-gray-600 font-medium border-r-2 border-gray-200 text-base">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={mobile}
                    onChange={e => { setMobile(e.target.value.replace(/\D/g, "")); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                    placeholder="Enter 10-digit number"
                    className="flex-1 px-4 py-4 text-lg font-mono focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-lg p-3">{error}</p>}

              <button
                onClick={handleSendOtp}
                disabled={loading || mobile.length < 10}
                className="w-full py-4 rounded-xl font-bold text-white text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "#0A3D2A" }}
              >
                {loading ? "Sending OTP..." : "Send OTP / OTP بھیجیں"}
              </button>

              <p className="text-center text-xs text-gray-400 mt-4">
                OTP will be sent via SMS and WhatsApp
              </p>
            </div>
          )}

          {step === "otp" && (
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => { setStep("mobile"); setOtp(["","","","","",""]); setError(""); }} className="text-gray-400 hover:text-gray-600">
                  <RotateCcw size={18} />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Enter OTP</h2>
                  <p className="text-sm text-gray-500">+91 {mobile} پر OTP بھیجا گیا</p>
                </div>
              </div>

              <div className="flex gap-2 justify-center mb-6">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { if (el) otpInputs.current[idx] = el; }}
                    type="tel"
                    maxLength={6}
                    value={digit}
                    onChange={e => handleOtpInput(idx, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Backspace" && !digit && idx > 0) otpInputs.current[idx - 1]?.focus();
                    }}
                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:border-green-600 transition-colors"
                    style={{ fontSize: 24 }}
                  />
                ))}
              </div>

              {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-lg p-3">{error}</p>}

              <button
                onClick={handleVerifyOtp}
                disabled={loading || otp.join("").length !== 6}
                className="w-full py-4 rounded-xl font-bold text-white text-base mb-4 transition-all disabled:opacity-50"
                style={{ background: "#0A3D2A" }}
              >
                {loading ? "Verifying..." : "Verify OTP / تصدیق کریں"}
              </button>

              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-sm text-gray-500">Resend OTP in 0:{String(resendTimer).padStart(2, "0")}</p>
                ) : (
                  <button onClick={() => { handleSendOtp(); setOtp(["","","","","",""]); }} className="text-sm text-green-700 font-medium hover:underline">
                    Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} className="p-6 md:p-8">
              <h2 className="text-xl font-bold text-gray-800 mb-1">Your Feedback</h2>
              <p className="text-sm text-gray-500 mb-6">اپنا تجربہ ہمارے ساتھ شیئر کریں</p>

              {(pilgrimInfo?.pilgrimName || pilgrimInfo?.bookingId || bookingIdParam) && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
                  <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-2">Verified Pilgrim / تصدیق شدہ حاجی</p>
                  <div className="flex flex-wrap gap-3">
                    {pilgrimInfo?.pilgrimName && (
                      <span className="bg-white border border-green-200 text-green-800 text-sm font-medium px-3 py-1 rounded-full">
                        {pilgrimInfo.pilgrimName}
                      </span>
                    )}
                    {(pilgrimInfo?.bookingId || bookingIdParam) && (
                      <span className="bg-white border border-green-200 text-green-800 text-sm font-mono px-3 py-1 rounded-full">
                        Booking: {pilgrimInfo?.bookingId || bookingIdParam}
                      </span>
                    )}
                    {pilgrimInfo?.groupName && (
                      <span className="bg-white border border-green-200 text-green-800 text-sm px-3 py-1 rounded-full">
                        {pilgrimInfo.groupName}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-5 mb-6">
                {CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <label className="block font-semibold text-gray-700 text-base">{cat.label}</label>
                    <p className="text-sm text-gray-400 mb-1">{cat.labelUr}</p>
                    <StarRating
                      value={ratings[cat.key] || 0}
                      onChange={v => setRatings(r => ({ ...r, [cat.key]: v }))}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    What did you like most? <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <p className="text-sm text-gray-400 mb-2">آپ کو سب سے زیادہ کیا پسند آیا؟</p>
                  <textarea
                    value={whatLiked}
                    onChange={e => setWhatLiked(e.target.value)}
                    rows={3}
                    placeholder="Tell us what you enjoyed..."
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-600 transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Suggestions / Complaints <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <p className="text-sm text-gray-400 mb-2">تجاویز / شکایت</p>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                    placeholder="Any complaints or suggestions for improvement..."
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-green-600 transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block font-semibold text-gray-700 mb-3">
                  Would you recommend us to others?
                  <br /><span className="text-sm text-gray-400 font-normal">کیا آپ ہمیں دوسروں کو recommend کریں گے؟</span>
                </label>
                <div className="flex gap-3">
                  {[
                    { v: "yes", label: "Yes / جی ہاں", color: "#0A3D2A" },
                    { v: "maybe", label: "Maybe / شاید", color: "#D97706" },
                    { v: "no", label: "No / نہیں", color: "#DC2626" },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setRecommend(opt.v as any)}
                      className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all"
                      style={{
                        background: recommend === opt.v ? opt.color : "#F9FAFB",
                        color: recommend === opt.v ? "#fff" : "#374151",
                        border: `2px solid ${recommend === opt.v ? opt.color : "#E5E7EB"}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-600 text-sm mb-4 bg-red-50 rounded-lg p-3">{error}</p>}

              <button
                type="submit"
                disabled={loading || !ratings.ratingOverall}
                className="w-full py-4 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ background: "#0A3D2A" }}
              >
                <Send size={18} />
                {loading ? "Submitting..." : "Submit Feedback / تاثرات جمع کریں"}
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} className="text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">JazakAllah Khair!</h2>
              <p className="text-gray-500 mb-2">جزاک اللہ خیراً</p>
              <p className="text-gray-600 mb-6">
                Thank you for sharing your valuable feedback. It helps us serve our pilgrims better on every journey.
              </p>
              <p className="text-gray-500 text-sm">
                آپ کے قیمتی تاثرات کا شکریہ۔ اللہ تعالیٰ آپ کی حج/عمرہ کو قبول فرمائے۔
              </p>
              <div className="mt-8 pt-6 border-t border-gray-100">
                <p className="text-xs text-gray-400">Al Burhan Tours & Travels | Burhanpur M.P.</p>
                <p className="text-xs text-gray-400">+91 8989701701</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
