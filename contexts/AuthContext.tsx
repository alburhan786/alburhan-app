import React, { createContext, useState, useContext, useEffect, useRef, useMemo } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { authService } from "@/services/api";
import { registerDeviceToken, unregisterDeviceToken } from "@/lib/notifications";

const GUEST_MODE_KEY = "@alburhan:guestMode";

interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
}

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  exitGuestMode: () => Promise<void>;
  sendOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  sendWhatsAppOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  verifyOtp: (phone: string, otp: string, userData: { name: string; email: string; password: string }) => Promise<void>;
  loginWithOtp: (phone: string) => Promise<{ success: boolean; message?: string; error?: string; fallbackOtp?: string; deliveryFailed?: boolean }>;
  verifyLoginOtp: (phone: string, otp: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addPushTokenListener((tokenData) => {
      console.log('[Push] FCM token refreshed:', String(tokenData.data).slice(0, 20) + '...');
      if (userRef.current) {
        registerDeviceToken(true);
      }
    });
    return () => sub.remove();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setIsGuest(false);
        registerDeviceToken();
      } else {
        const guestMode = await AsyncStorage.getItem(GUEST_MODE_KEY);
        if (guestMode === "true") {
          setIsGuest(true);
        }
      }
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const continueAsGuest = async () => {
    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    setIsGuest(true);
  };

  const exitGuestMode = async () => {
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    setIsGuest(false);
  };

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password);
    if (response.success) {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      setIsGuest(false);
      setUser(response.user);
      registerDeviceToken();
    } else {
      throw new Error(response.error || "Login failed");
    }
  };

  const register = async (data: { name: string; email: string; phone: string; password: string }) => {
    const response = await authService.register(data);
    if (response.success) {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      setIsGuest(false);
      setUser(response.user);
      registerDeviceToken();
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
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      setIsGuest(false);
      setUser(response.user);
      registerDeviceToken();
    } else {
      throw new Error(response.error || "OTP verification failed");
    }
  };

  const loginWithOtp = async (phone: string) => {
    const response = await authService.loginWithOtp(phone);
    if (!response.success) {
      const err = new Error(response.error || "Failed to send login OTP") as any;
      err.errorCode = response.errorCode;
      throw err;
    }
    return response;
  };

  const verifyLoginOtp = async (phone: string, otp: string) => {
    const response = await authService.verifyLoginOtp(phone, otp);
    if (response.success) {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      setIsGuest(false);
      setUser(response.user);
      registerDeviceToken();
    } else {
      throw new Error(response.error || "OTP verification failed");
    }
  };

  const logout = async () => {
    await unregisterDeviceToken();
    await authService.logout();
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    setIsGuest(false);
    setUser(null);
  };

  const value = useMemo(() => ({
    user, isGuest, loading, login, register, logout,
    continueAsGuest, exitGuestMode,
    sendOtp, sendWhatsAppOtp, verifyOtp, loginWithOtp, verifyLoginOtp,
  }), [user, isGuest, loading]);

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
