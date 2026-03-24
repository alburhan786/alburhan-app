import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";

const OTP_LENGTH = 6;

export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  const { mobile, isNewUser } = useLocalSearchParams<{ mobile: string; isNewUser: string }>();
  const { login, baseUrl } = useAuth();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(30);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (otp.length === OTP_LENGTH) {
      handleVerify(otp);
    }
  }, [otp]);

  const handleVerify = async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${baseUrl}/api/auth/verify-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid OTP");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await login(data.user);
      if (isNewUser === "1" || !data.user.name) {
        router.replace("/setup");
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e.message || "Invalid OTP");
      setOtp("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      const res = await fetch(`${baseUrl}/api/auth/send-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      if (!res.ok) throw new Error("Failed to resend OTP");
      setCountdown(30);
      setOtp("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      setError(e.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const otpDigits = otp.padEnd(OTP_LENGTH, " ").split("");

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: COLORS.darkGreen }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: topPad + 24 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.logoText}>البرہان</Text>
          <Text style={styles.headerTitle}>Verify OTP</Text>
          <Text style={styles.headerSub}>
            Sent to <Text style={styles.mobileHighlight}>+91 {mobile}</Text>
          </Text>
        </View>
      </View>

      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}>
        <View style={styles.otpContainer}>
          {otpDigits.map((digit, index) => (
            <View
              key={index}
              style={[
                styles.otpBox,
                index < otp.length ? styles.otpBoxFilled : null,
                error && styles.otpBoxError,
                index === otp.length ? styles.otpBoxActive : null,
              ]}
            >
              <Text style={styles.otpDigit}>{digit.trim()}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={otp}
            onChangeText={v => {
              setOtp(v.replace(/\D/g, "").slice(0, OTP_LENGTH));
              setError("");
            }}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
          />
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={13} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color={COLORS.darkGreen} />
            <Text style={styles.verifyingText}>Verifying…</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleResend}
          disabled={countdown > 0 || resending}
          style={styles.resendBtn}
        >
          {resending ? (
            <ActivityIndicator size="small" color={COLORS.darkGreen} />
          ) : (
            <Text style={[styles.resendText, countdown > 0 && styles.resendDisabled]}>
              {countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
            </Text>
          )}
        </Pressable>

        <View style={styles.infoBox}>
          <Feather name="info" size={14} color={COLORS.textMuted} />
          <Text style={styles.infoText}>
            The OTP was sent via SMS and WhatsApp. Check your messages.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flex: 1,
    justifyContent: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  headerContent: {
    gap: 4,
  },
  logoText: {
    fontSize: 22,
    color: COLORS.gold,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  mobileHighlight: {
    color: COLORS.gold,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  otpBox: {
    width: 46,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFilled: {
    borderColor: COLORS.darkGreen,
    backgroundColor: "rgba(11,61,46,0.05)",
  },
  otpBoxActive: {
    borderColor: COLORS.gold,
    borderWidth: 2,
  },
  otpBoxError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorBg,
  },
  otpDigit: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 16,
    justifyContent: "center",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.error,
  },
  verifyingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    marginBottom: 16,
  },
  verifyingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  resendBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 16,
  },
  resendText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.darkGreen,
  },
  resendDisabled: {
    color: COLORS.textMuted,
    fontFamily: "Inter_400Regular",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
