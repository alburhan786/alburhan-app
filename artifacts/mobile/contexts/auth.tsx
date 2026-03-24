import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AuthUser {
  id: string;
  name: string | null;
  mobile: string;
  email: string | null;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => void;
  baseUrl: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "alburhan_user";

export function AuthProvider({ children, baseUrl }: { children: React.ReactNode; baseUrl: string }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const storedUser = stored ? JSON.parse(stored) : null;

      const response = await fetch(`${baseUrl}/api/auth/me`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const freshUser = await response.json();
        setUser(freshUser);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(freshUser));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setUser(null);
      }
    } catch {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) setUser(JSON.parse(stored));
        else setUser(null);
      } catch {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (userData: AuthUser) => {
    setUser(userData);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, [baseUrl]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      updateUser,
      baseUrl,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
