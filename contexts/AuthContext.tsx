import React, { createContext, useState, useContext, useEffect, useMemo } from "react";
import { authService } from "@/services/api";

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  sendWhatsAppOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  verifyOtp: (phone: string, otp: string, userData: { name: string; email: string; password: string }) => Promise<void>;
  loginWithOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  verifyLoginOtp: (phone: string, otp: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    if (response.success) {
      setUser(response.user);
    } else {
      throw new Error(response.error || "Login failed");
    }
  };

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const response = await authService.register(data);
    if (response.success) {
      setUser(response.user);
    } else {
      throw new Error(response.error || "Registration failed");
    }
  };

  const sendOtp = async (phone: string) => {
    const response = await authService.sendOtp(phone);
    if (!response.success) {
      throw new Error(response.error || "Failed to send OTP");
    }
    return response;
  };

  const sendWhatsAppOtp = async (phone: string) => {
    const response = await authService.sendWhatsAppOtp(phone);
    if (!response.success) {
      throw new Error(response.error || "Failed to send WhatsApp OTP");
    }
    return response;
  };

  const verifyOtp = async (phone: string, otp: string, userData: { name: string; email: string; password: string }) => {
    const response = await authService.verifyOtp(phone, otp, userData);
    if (response.success) {
      setUser(response.user);
    } else {
      throw new Error(response.error || "OTP verification failed");
    }
  };

  const loginWithOtp = async (phone: string) => {
    const response = await authService.loginWithOtp(phone);
    if (!response.success) {
      throw new Error(response.error || "Failed to send login OTP");
    }
    return response;
  };

  const verifyLoginOtp = async (phone: string, otp: string) => {
    const response = await authService.verifyLoginOtp(phone, otp);
    if (response.success) {
      setUser(response.user);
    } else {
      throw new Error(response.error || "OTP verification failed");
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const value = useMemo(() => ({
    user, loading, login, register, logout,
    sendOtp, sendWhatsAppOtp, verifyOtp, loginWithOtp, verifyLoginOtp,
  }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
