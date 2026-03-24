import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { baseUrl } = useAuth();
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

  const isValid = /^[6-9]\d{9}$/.test(mobile);

  const handleSendOtp = async () => {
    if (!isValid || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${baseUrl}/api/auth/send-otp`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");
      router.push({ pathname: "/verify", params: { mobile, isNewUser: data.isNewUser ? "1" : "0" } });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: COLORS.darkGreen }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: topPad + 32 }]}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoArabic}>البرہان</Text>
          <Text style={styles.logoText}>AL BURHAN</Text>
          <Text style={styles.logoSub}>TOURS & TRAVELS</Text>
        </View>
        <Text style={styles.tagline}>Your Sacred Journey Partner</Text>
        <Text style={styles.taglineSub}>35+ Years of Trust & Service</Text>
      </View>

      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}>
        <Text style={styles.cardTitle}>Welcome Back</Text>
        <Text style={styles.cardSubtitle}>Enter your mobile number to continue</Text>

        <View style={styles.inputGroup}>
          <View style={[styles.inputWrapper, error ? styles.inputError : null]}>
            <View style={styles.flagContainer}>
              <Text style={styles.countryCode}>+91</Text>
            </View>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={mobile}
              onChangeText={v => { setMobile(v.replace(/\D/g, "").slice(0, 10)); setError(""); }}
              placeholder="Mobile Number"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />
            {mobile.length > 0 && (
              <Pressable onPress={() => { setMobile(""); setError(""); inputRef.current?.focus(); }} style={styles.clearBtn}>
                <Feather name="x" size={16} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={13} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={handleSendOtp}
          disabled={!isValid || loading}
          style={({ pressed }) => [
            styles.btn,
            (!isValid || loading) && styles.btnDisabled,
            pressed && isValid && !loading && styles.btnPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>Get OTP</Text>
          )}
        </Pressable>

        <Text style={styles.footer}>
          By continuing, you agree to receive OTP via SMS & WhatsApp
        </Text>

        <View style={styles.contactRow}>
          <Feather name="phone" size={13} color={COLORS.textMuted} />
          <Text style={styles.contactText}>Need help? Call +91 8989701701</Text>
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
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 40,
    flex: 1,
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  logoArabic: {
    fontSize: 36,
    color: COLORS.gold,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  logoText: {
    fontSize: 26,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
  },
  logoSub: {
    fontSize: 12,
    color: COLORS.gold,
    fontFamily: "Inter_500Medium",
    letterSpacing: 4,
    marginTop: 2,
  },
  tagline: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_500Medium",
    marginTop: 12,
    textAlign: "center",
  },
  taglineSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "center",
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    marginBottom: 28,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceAlt,
    overflow: "hidden",
  },
  inputError: {
    borderColor: COLORS.error,
  },
  flagContainer: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
  },
  countryCode: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  clearBtn: {
    padding: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.error,
    flex: 1,
  },
  btn: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.darkGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  btnDisabled: {
    backgroundColor: "#B0C8C0",
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  btnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  footer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 16,
    lineHeight: 16,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  contactText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
});
