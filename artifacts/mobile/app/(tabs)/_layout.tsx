import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, Badge, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";

function useUnreadCount(baseUrl: string, isAuthenticated: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetch_ = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/notifications/my/unread-count`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          setCount(data.count || 0);
        }
      } catch {}
    };
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => clearInterval(interval);
  }, [baseUrl, isAuthenticated]);

  return count;
}

function NativeTabLayout({ unreadCount }: { unreadCount: number }) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="documents">
        <Icon sf={{ default: "folder", selected: "folder.fill" }} />
        <Label>Documents</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications">
        <Icon sf={{ default: "bell", selected: "bell.fill" }} />
        <Label>Alerts</Label>
        {unreadCount > 0 && <Badge>{unreadCount > 99 ? "99+" : String(unreadCount)}</Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ unreadCount }: { unreadCount: number }) {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.darkGreen,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : COLORS.surface,
          borderTopWidth: isWeb ? 1 : 0.5,
          borderTopColor: COLORS.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.surface }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="folder" tintColor={color} size={24} />
            ) : (
              <Feather name="folder" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bell" tintColor={color} size={24} />
            ) : (
              <Feather name="bell" size={22} color={color} />
            ),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: COLORS.error,
            fontSize: 10,
            fontFamily: "Inter_700Bold",
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isAuthenticated, baseUrl } = useAuth();
  const unreadCount = useUnreadCount(baseUrl, isAuthenticated);

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout unreadCount={unreadCount} />;
  }
  return <ClassicTabLayout unreadCount={unreadCount} />;
}
