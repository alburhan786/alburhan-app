import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";

const API = import.meta.env.VITE_API_URL || "";

interface DeleteGuardCtx {
  requestDelete: (label: string, doDelete: (token: string) => Promise<void>) => void;
}

const DeleteGuardContext = createContext<DeleteGuardCtx>({ requestDelete: () => {} });

export function DeleteGuardProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedSecs, setLockedSecs] = useState(0);
  const [label, setLabel] = useState("");
  const pendingRef = useRef<((token: string) => Promise<void>) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLockout = (secs: number) => {
    setLockedSecs(secs);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setLockedSecs(s => {
        if (s <= 1) { clearInterval(timerRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const requestDelete = useCallback((deleteLabel: string, doDelete: (token: string) => Promise<void>) => {
    setLabel(deleteLabel);
    setPassword("");
    setError("");
    setLockedSecs(0);
    pendingRef.current = doDelete;
    setOpen(true);
  }, []);

  const handleClose = () => {
    if (loading) return;
    setOpen(false);
  };

  const handleVerify = async () => {
    if (!password.trim()) { setError("Please enter the admin delete password."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/delete-auth/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, itemType: label }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.locked) startLockout(data.secs ?? 30);
        setError(data.error || data.message || "Authorization failed.");
        return;
      }
      setOpen(false);
      await pendingRef.current!(data.token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DeleteGuardContext.Provider value={{ requestDelete }}>
      {children}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0f172a",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "20px",
              padding: "36px 32px 28px",
              width: "100%", maxWidth: "420px",
              boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "28px" }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "rgba(239,68,68,0.12)",
                border: "1.5px solid rgba(239,68,68,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 16,
              }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <h2 style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.3px" }}>
                Confirm Delete
              </h2>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                You are about to permanently delete:<br />
                <strong style={{ color: "#f87171", fontWeight: 600 }}>{label}</strong>
              </p>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{
                color: "#94a3b8", fontSize: "12px", fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase",
                display: "block", marginBottom: "8px",
              }}>
                Admin Delete Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !lockedSecs && !loading) handleVerify();
                }}
                placeholder="Enter password to authorise"
                disabled={!!lockedSecs || loading}
                autoFocus
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#1e293b",
                  border: error ? "1.5px solid rgba(239,68,68,0.6)" : "1.5px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  color: "#f1f5f9", fontSize: "15px",
                  outline: "none",
                  transition: "border-color 0.2s",
                  opacity: (!!lockedSecs || loading) ? 0.6 : 1,
                }}
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "8px",
                padding: "10px 12px",
                color: "#fca5a5",
                fontSize: "13px",
                marginBottom: "12px",
                lineHeight: 1.4,
              }}>
                🔒 {error}
              </div>
            )}

            {lockedSecs > 0 && (
              <div style={{
                textAlign: "center", color: "#fbbf24",
                fontSize: "13px", marginBottom: "12px",
                fontWeight: 600,
              }}>
                Locked — try again in {lockedSecs}s
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleClose}
                disabled={loading}
                style={{
                  flex: 1, padding: "12px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  color: "#94a3b8", fontSize: "14px", fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleVerify}
                disabled={loading || !!lockedSecs}
                style={{
                  flex: 1, padding: "12px",
                  background: (loading || !!lockedSecs) ? "rgba(239,68,68,0.3)" : "#dc2626",
                  border: "none",
                  borderRadius: "10px",
                  color: "#fff", fontSize: "14px", fontWeight: 700,
                  cursor: (loading || !!lockedSecs) ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  letterSpacing: "0.02em",
                }}
              >
                {loading ? "Verifying…" : "Verify & Delete"}
              </button>
            </div>

            <p style={{ color: "#334155", fontSize: "11px", textAlign: "center", marginTop: "16px", marginBottom: 0 }}>
              This action cannot be undone. All associated data will be permanently removed.
            </p>
          </div>
        </div>
      )}
    </DeleteGuardContext.Provider>
  );
}

export function useDeleteGuard() {
  return useContext(DeleteGuardContext);
}
