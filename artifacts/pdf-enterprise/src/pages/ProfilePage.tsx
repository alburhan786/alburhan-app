import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { auth } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { User, ShieldCheck, Key, AlertTriangle, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [twoFASetup, setTwoFASetup] = useState<any>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [disableConfirm, setDisableConfirm] = useState(false);
  const [pwData, setPwData] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  async function setup2FA() {
    try {
      const res = await auth.setup2fa();
      setTwoFASetup(res);
    } catch (err: any) { toast.error(err.message); }
  }

  async function confirm2FA(e: React.FormEvent) {
    e.preventDefault();
    try {
      await auth.confirm2fa(confirmCode);
      toast.success("2FA enabled successfully!");
      setTwoFASetup(null);
      setConfirmCode("");
      await refresh();
    } catch (err: any) { toast.error(err.message); }
  }

  async function disable2FA() {
    try {
      await auth.disable2fa();
      toast.success("2FA disabled");
      setDisableConfirm(false);
      await refresh();
    } catch (err: any) { toast.error(err.message); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwData.newPassword !== pwData.confirm) { toast.error("Passwords don't match"); return; }
    if (pwData.newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await auth.changePassword({ currentPassword: pwData.currentPassword, newPassword: pwData.newPassword });
      toast.success("Password changed successfully");
      setPwData({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  return (
    <Layout>
      <div style={{ padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#d4d8e1", marginBottom: "2rem" }}>Profile & Security</h1>

        {/* User info */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="flex items-center gap-4">
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 800, color: "white",
            }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#d4d8e1" }}>{user?.username}</div>
              <div style={{ fontSize: 13, color: "#4a5568" }}>{user?.email}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${user?.role === "admin" ? "badge-red" : user?.role === "editor" ? "badge-blue" : "badge-gray"}`} style={{ textTransform: "capitalize" }}>
                  {user?.role}
                </span>
                {user?.twoFactorEnabled && <span className="badge badge-green">🔒 2FA On</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 2FA section */}
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={20} color="#3b82f6" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#d4d8e1", margin: 0 }}>Two-Factor Authentication</h2>
          </div>

          {user?.twoFactorEnabled ? (
            <div>
              <p style={{ fontSize: 13, color: "#4ade80", marginBottom: 12 }}>✓ 2FA is enabled on your account</p>
              {!disableConfirm ? (
                <button className="btn-danger" style={{ padding: "7px 16px", fontSize: 13 }} onClick={() => setDisableConfirm(true)}>
                  Disable 2FA
                </button>
              ) : (
                <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ fontSize: 13, color: "#fca5a5", marginBottom: 10 }}>
                    <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
                    Are you sure? Disabling 2FA reduces your account security.
                  </p>
                  <div className="flex gap-2">
                    <button className="btn-danger" style={{ padding: "6px 14px", fontSize: 13 }} onClick={disable2FA}>Yes, Disable</button>
                    <button className="btn-secondary" style={{ padding: "6px 14px", fontSize: 13 }} onClick={() => setDisableConfirm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : twoFASetup ? (
            <div>
              <p style={{ fontSize: 13, color: "#8b9ab5", marginBottom: 12 }}>
                Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
              </p>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <img src={twoFASetup.qrDataUrl} alt="QR Code" style={{ width: 180, height: 180, borderRadius: 8 }} />
              </div>
              <div style={{ background: "#0d1117", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 12 }}>
                <label style={{ marginBottom: 4 }}>Manual entry code:</label>
                <div style={{ fontFamily: "monospace", color: "#60a5fa", letterSpacing: "0.15em" }}>{twoFASetup.secret}</div>
              </div>
              <form onSubmit={confirm2FA} className="flex flex-col gap-3">
                <div>
                  <label>6-Digit Code from Authenticator App</label>
                  <input
                    type="text"
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    style={{ fontSize: 20, letterSpacing: "0.3em", textAlign: "center" }}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex items-center gap-1" style={{ padding: "7px 16px" }}><Check size={14} /> Enable 2FA</button>
                  <button type="button" className="btn-secondary" style={{ padding: "7px 14px" }} onClick={() => setTwoFASetup(null)}><X size={14} /></button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: "#8b9ab5", marginBottom: 12 }}>
                2FA adds an extra layer of security. You'll need an authenticator app.
              </p>
              <button className="btn-primary flex items-center gap-2" style={{ padding: "7px 16px", fontSize: 13 }} onClick={setup2FA}>
                <ShieldCheck size={14} /> Set Up 2FA
              </button>
            </div>
          )}
        </div>

        {/* Change password */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Key size={20} color="#3b82f6" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#d4d8e1", margin: 0 }}>Change Password</h2>
          </div>
          <form onSubmit={changePassword} className="flex flex-col gap-4">
            <div><label>Current Password</label><input type="password" value={pwData.currentPassword} onChange={(e) => setPwData({ ...pwData, currentPassword: e.target.value })} required /></div>
            <div><label>New Password (min 8 chars)</label><input type="password" value={pwData.newPassword} onChange={(e) => setPwData({ ...pwData, newPassword: e.target.value })} minLength={8} required /></div>
            <div><label>Confirm New Password</label><input type="password" value={pwData.confirm} onChange={(e) => setPwData({ ...pwData, confirm: e.target.value })} required /></div>
            <button type="submit" className="btn-primary" style={{ padding: "8px 20px", alignSelf: "flex-start" }} disabled={loading}>
              {loading ? "Updating…" : "Change Password"}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
