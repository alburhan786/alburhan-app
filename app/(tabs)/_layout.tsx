import { Tabs } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NOTIFS_VIEWED_AT_KEY, NOTIFS_VIEWED_QUERY_KEY } from "@/constants/notificationBadge";

export default function TabLayout() {
  const { user } = useAuth();

  const { data: notifData } = useQuery<{ success: boolean; notifications: { sentAt: string }[] }>({
    queryKey: ["/api/notifications"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const viewedQueryKey = user ? NOTIFS_VIEWED_QUERY_KEY(user.id) : null;
  const viewedAtStorageKey = user ? NOTIFS_VIEWED_AT_KEY(user.id) : null;

  const { data: viewedAtStr } = useQuery<string | null>({
    queryKey: viewedQueryKey ?? ["notificationsViewedAt", null],
    queryFn: () => (viewedAtStorageKey ? AsyncStorage.getItem(viewedAtStorageKey) : null),
    enabled: !!user,
    staleTime: Infinity,
  });

  const lastViewedAt = viewedAtStr ? new Date(viewedAtStr) : null;
  const notifications = notifData?.notifications ?? [];
  const unreadCount = lastViewedAt
    ? notifications.filter((n) => new Date(n.sentAt) > lastViewedAt).length
    : notifications.length;
  const badgeValue = user && unreadCount > 0
    ? (unreadCount > 99 ? "99+" : unreadCount)
    : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          paddingBottom: Platform.OS === "web" ? 34 : 5,
          paddingTop: 5,
          height: Platform.OS === "web" ? 84 : 65,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600" as const,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Packages",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="package-variant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hotels"
        options={{
          title: "Hotels",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bed" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: "Videos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="brochures"
        options={{
          title: "Brochures",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="file-document" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={badgeValue ? "notifications" : "notifications-outline"}
              size={size}
              color={color}
            />
          ),
          tabBarBadge: badgeValue,
          tabBarBadgeStyle: {
            backgroundColor: "#ef4444",
            color: "#ffffff",
            fontSize: 10,
            fontWeight: "700" as const,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            lineHeight: 16,
          },
        }}
      />
      <Tabs.Screen
        name="contact"
        options={{
          title: "Contact",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="call" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
