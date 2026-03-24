import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  mina_update: { icon: "map-pin", color: "#7C3AED", bg: "#EDE9FE" },
  tawaf_update: { icon: "refresh-cw", color: "#0369A1", bg: "#E0F2FE" },
  madinah_update: { icon: "compass", color: "#15803D", bg: "#DCFCE7" },
  flight_update: { icon: "send", color: "#0369A1", bg: "#E0F2FE" },
  bus_update: { icon: "truck", color: "#C2410C", bg: "#FFEDD5" },
  food_update: { icon: "coffee", color: "#92400E", bg: "#FEF3C7" },
  ziyarat_update: { icon: "map", color: "#065F46", bg: "#D1FAE5" },
  general: { icon: "bell", color: COLORS.darkGreen, bg: "#D1FAE5" },
};

function NotificationItem({ item, onMarkRead }: { item: Notification; onMarkRead: (id: string) => void }) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.general;
  const date = new Date(item.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeStr = "";
  if (diffMins < 1) timeStr = "Just now";
  else if (diffMins < 60) timeStr = `${diffMins}m ago`;
  else if (diffHours < 24) timeStr = `${diffHours}h ago`;
  else if (diffDays < 7) timeStr = `${diffDays}d ago`;
  else timeStr = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

  return (
    <Pressable
      onPress={() => { if (!item.isRead) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMarkRead(item.id); } }}
      style={({ pressed }) => [
        styles.notifCard,
        !item.isRead && styles.notifUnread,
        pressed && { opacity: 0.85 },
      ]}
    >
      {!item.isRead && <View style={styles.unreadDot} />}
      <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
        <Feather name={config.icon as any} size={18} color={config.color} />
      </View>
      <View style={styles.notifContent}>
        <View style={styles.notifHeader}>
          <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notifTime}>{timeStr}</Text>
        </View>
        <Text style={styles.notifMessage} numberOfLines={3}>{item.message}</Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { baseUrl } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/notifications/my`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {}
  }, [baseUrl]);

  useEffect(() => {
    fetchNotifications().finally(() => setLoading(false));
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    try {
      await fetch(`${baseUrl}/api/notifications/my/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {}
  }, [baseUrl]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await fetch(`${baseUrl}/api/notifications/my/read-all`, {
        method: "PATCH",
        credentials: "include",
      });
    } catch {}
    setMarkingAll(false);
  }, [baseUrl, markingAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <View style={[styles.pageHeader, { paddingTop: topPad + 20 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
            )}
          </View>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} style={styles.markAllBtn}>
              {markingAll ? (
                <ActivityIndicator size="small" color={COLORS.gold} />
              ) : (
                <>
                  <Feather name="check-square" size={14} color={COLORS.gold} />
                  <Text style={styles.markAllText}>Mark all read</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.darkGreen} />
        }
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.darkGreen} />
            <Text style={styles.loadingText}>Loading notifications…</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconBox}>
              <Feather name="bell" size={36} color={COLORS.border} />
            </View>
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyText}>
              You will receive updates about your journey here
            </Text>
          </View>
        ) : (
          <View style={styles.listContent}>
            {notifications.map(n => (
              <NotificationItem key={n.id} item={n} onMarkRead={handleMarkRead} />
            ))}
            <Text style={styles.listFooter}>
              Showing last {notifications.length} notifications
            </Text>
          </View>
        )}
        <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  unreadBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: COLORS.gold,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  markAllText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.gold,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 64,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  notifCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
    position: "relative",
  },
  notifUnread: {
    borderColor: COLORS.darkGreen + "30",
    backgroundColor: "rgba(11,61,46,0.03)",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.darkGreen,
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifContent: {
    flex: 1,
    gap: 5,
  },
  notifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  notifTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: COLORS.textSecondary,
  },
  notifTitleUnread: {
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  notifTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    flexShrink: 0,
  },
  notifMessage: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  listFooter: {
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    paddingVertical: 12,
  },
});
