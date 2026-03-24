import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const { updateUser, logout, baseUrl } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = name.trim().length >= 2;

  const handleSave = async () => {
    if (!isValid || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${baseUrl}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save profile");
      updateUser({ name: data.name, email: data.email });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: COLORS.darkGreen }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: topPad + 24 }]}>
        <Text style={styles.arabicText}>مرحباً بكم</Text>
        <Text style={styles.headerTitle}>Complete Your Profile</Text>
        <Text style={styles.headerSub}>
          Help us personalise your experience
        </Text>
      </View>

      <ScrollView
        style={styles.card}
        contentContainerStyle={[styles.cardContent, { paddingBottom: Math.max(bottomPad + 24, 40) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.welcomeBox}>
          <Feather name="user" size={32} color={COLORS.darkGreen} />
          <Text style={styles.welcomeTitle}>Welcome to Al Burhan!</Text>
          <Text style={styles.welcomeText}>
            You are all set for your sacred journey. Please tell us your name to get started.
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Full Name *</Text>
          <View style={[styles.inputWrapper, error && name.length === 0 ? styles.inputError : null]}>
            <Feather name="user" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={v => { setName(v); setError(""); }}
              placeholder="Your full name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email (Optional)</Text>
          <View style={styles.inputWrapper}>
            <Feather name="mail" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={v => setEmail(v)}
              placeholder="your@email.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={13} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSave}
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
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.btnText}>Continue to Dashboard</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={logout} style={styles.skipBtn}>
          <Text style={styles.skipText}>Sign out instead</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  arabicText: {
    fontSize: 28,
    color: COLORS.gold,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  cardContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 20,
  },
  welcomeBox: {
    alignItems: "center",
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    padding: 24,
    gap: 10,
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
    textAlign: "center",
  },
  welcomeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  formGroup: { gap: 8 },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
  },
  inputError: { borderColor: COLORS.error },
  inputIcon: { marginLeft: 14 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: COLORS.darkGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginTop: 4,
  },
  btnDisabled: {
    backgroundColor: "#B0C8C0",
    shadowOpacity: 0,
    elevation: 0,
  },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  btnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
});
