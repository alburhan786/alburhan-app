import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/api";

export interface PdfUser {
  id: string;
  username: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  twoFactorEnabled: boolean;
  sessionTimeoutMinutes?: number;
  lastLogin?: string;
}

interface AuthCtx {
  user: PdfUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ requiresTwoFactor?: boolean }>;
  verifyTwoFactor: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PdfUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const u = await auth.me();
      setUser(u);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await auth.login({ username, password });
    if (res.requiresTwoFactor) return { requiresTwoFactor: true };
    setUser(res.user);
    return {};
  }

  async function verifyTwoFactor(code: string) {
    const res = await auth.verifyTwoFactor(code);
    setUser(res.user);
  }

  async function logout() {
    try { await auth.logout(); } catch {}
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login, verifyTwoFactor, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
