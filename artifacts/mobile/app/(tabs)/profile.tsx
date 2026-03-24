import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, value, onPress, destructive, right }: {
  icon: string; label: string; value?: string; onPress?: () => void; destructive?: boolean; right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, destructive && styles.menuIconDestructive]}>
        <Feather name={icon as any} size={16} color={destructive ? COLORS.error : COLORS.darkGreen} />
      </View>
      <View style={styles.menuLabel}>
        <Text style={[styles.menuLabelText, destructive && { color: COLORS.error }]}>{label}</Text>
        {value ? <Text style={styles.menuValue} numberOfLines={1}>{value}</Text> : null}
      </View>
      {right ?? (onPress && <Feather name="chevron-right" size={16} color={COLORS.textMuted} />)}
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser, baseUrl } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const initials = (user?.name ?? user?.mobile ?? "?").charAt(0).toUpperCase();

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update");
      updateUser({ name: data.name, email: data.email });
      setEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to update profile");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          await logout();
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: COLORS.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.headerBanner, { paddingTop: topPad + 24 }]}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.userName}>{user?.name || "Welcome"}</Text>
        <Text style={styles.userMobile}>+91 {user?.mobile}</Text>
        {user?.role === "admin" && (
          <View style={styles.adminBadge}>
            <Feather name="shield" size={11} color={COLORS.gold} />
            <Text style={styles.adminBadgeText}>Administrator</Text>
          </View>
        )}
      </View>

      {/* Edit Profile */}
      {editing ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Edit Profile</Text>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Full Name</Text>
            <TextInput
              style={styles.formInput}
              value={name}
              onChangeText={setName}
              placeholder="Your full name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
              autoFocus
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Email</Text>
            <TextInput
              style={styles.formInput}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.editActions}>
            <Pressable onPress={() => { setEditing(false); setName(user?.name ?? ""); setEmail(user?.email ?? ""); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={!name.trim() || saving} style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Account */}
      <Section title="Account">
        <MenuItem icon="user" label="Name" value={user?.name ?? "Not set"} onPress={() => { setEditing(true); setName(user?.name ?? ""); setEmail(user?.email ?? ""); }} />
        <Divider />
        <MenuItem icon="phone" label="Mobile" value={`+91 ${user?.mobile}`} />
        <Divider />
        <MenuItem icon="mail" label="Email" value={user?.email ?? "Not set"} onPress={() => { setEditing(true); setName(user?.name ?? ""); setEmail(user?.email ?? ""); }} />
      </Section>

      {/* Contact */}
      <Section title="Contact Al Burhan">
        <MenuItem
          icon="phone"
          label="Call Us"
          value="+91 8989701701"
          onPress={() => Linking.openURL("tel:+918989701701")}
        />
        <Divider />
        <MenuItem
          icon="message-circle"
          label="WhatsApp"
          value="+91 8989701701"
          onPress={() => Linking.openURL("https://wa.me/918989701701")}
        />
        <Divider />
        <MenuItem
          icon="map-pin"
          label="Office"
          value="5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur 450331 M.P."
        />
      </Section>

      {/* About */}
      <Section title="About">
        <MenuItem icon="star" label="35+ Years of Service" value="Since 1989, trusted Hajj & Umrah partner" />
        <Divider />
        <MenuItem icon="info" label="GSTIN" value="23AAVFA3223C1ZW" />
        <Divider />
        <MenuItem icon="credit-card" label="HDFC Bank" value="A/C: 50200011391336 | IFSC: HDFC0001769" />
      </Section>

      {/* Sign Out */}
      <View style={[styles.section, { marginBottom: 0 }]}>
        <View style={styles.sectionCard}>
          <MenuItem
            icon="log-out"
            label={loggingOut ? "Signing out…" : "Sign Out"}
            destructive
            onPress={loggingOut ? undefined : handleLogout}
            right={loggingOut ? <ActivityIndicator size="small" color={COLORS.error} /> : undefined}
          />
        </View>
      </View>

      <Text style={styles.versionText}>Al Burhan Tours & Travels v1.0.0</Text>
      <Text style={styles.copyrightText}>Burhanpur, M.P. | All rights reserved</Text>

      <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    backgroundColor: COLORS.darkGreen,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 36,
    gap: 8,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarText: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
  },
  userName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  userMobile: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(201,162,63,0.2)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  adminBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.gold,
  },
  editCard: {
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
    gap: 16,
  },
  editTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  formGroup: { gap: 6 },
  formLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  formInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: COLORS.text,
    backgroundColor: COLORS.surfaceAlt,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: COLORS.darkGreen,
    shadowColor: COLORS.darkGreen,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: "#B0C8C0",
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  section: {
    marginHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuIconDestructive: {
    backgroundColor: COLORS.errorBg,
  },
  menuLabel: { flex: 1, gap: 2 },
  menuLabelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.text,
  },
  menuValue: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginLeft: 62,
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    marginTop: 28,
  },
  copyrightText: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    marginTop: 4,
  },
});
