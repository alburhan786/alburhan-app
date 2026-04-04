import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { setupAndroidChannel } from "@/lib/notifications";
import { InAppNotificationBanner, type NotificationData } from "@/components/InAppNotificationBanner";

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  const router = useRouter();
  const { user } = useAuth();

  // All refs declared upfront
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const handledResponseId = useRef<string | null>(null);
  const pendingNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeNotification, setActiveNotification] = useState<NotificationData | null>(null);

  // --- Helper functions ---

  /**
   * Map spec-defined screen labels (or existing Expo Router paths) to valid app routes.
   * Spec labels: BookingDetails, Payment, Documents, Updates, Schedule, Services, Home.
   * Paths starting with "/" are passed through directly.
   */
  function resolveScreen(screen: string, bookingId?: string): Href | null {
    if (screen.startsWith('/')) return screen as Href;
    switch (screen) {
      case 'BookingDetails':
      case 'Payment':
        if (bookingId) return { pathname: '/booking/[id]', params: { id: bookingId } } as Href;
        return '/(tabs)/bookings' as Href;
      case 'Documents':
        return '/(tabs)/profile' as Href;
      case 'Updates':
      case 'Schedule':
      case 'Services':
        return '/(tabs)/notifications' as Href;
      case 'Home':
        return '/(tabs)/' as Href;
      default:
        return null;
    }
  }

  function navigateFromData(data: Record<string, unknown>) {
    if (pendingNavTimer.current) clearTimeout(pendingNavTimer.current);
    pendingNavTimer.current = setTimeout(() => {
      pendingNavTimer.current = null;
      const bookingId = data?.bookingId ? String(data.bookingId) : undefined;
      if (data?.screen && typeof data.screen === 'string') {
        const dest = resolveScreen(data.screen, bookingId);
        if (dest) router.push(dest);
      } else if (bookingId) {
        router.push({ pathname: '/booking/[id]', params: { id: bookingId } } as Href);
      }
    }, 400);
  }

  function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const requestId = response.notification.request.identifier;
    if (handledResponseId.current === requestId) return;
    handledResponseId.current = requestId;

    const { title, body, data: rawData } = response.notification.request.content;
    const data = rawData as Record<string, unknown>;
    setActiveNotification({
      title: title ?? undefined,
      body: body ?? undefined,
      data: data ?? undefined,
    });
    navigateFromData(data);
  }

  function handleBannerPress(data?: Record<string, unknown>) {
    if (pendingNavTimer.current) {
      clearTimeout(pendingNavTimer.current);
      pendingNavTimer.current = null;
    }
    if (!data) return;
    const bookingId = data.bookingId ? String(data.bookingId) : undefined;
    if (data.screen && typeof data.screen === 'string') {
      const dest = resolveScreen(data.screen, bookingId);
      if (dest) router.push(dest);
    } else if (bookingId) {
      router.push({ pathname: '/booking/[id]', params: { id: bookingId } } as Href);
    }
  }

  // --- Effects ---

  useEffect(() => {
    if (Platform.OS === 'web') return;
    setupAndroidChannel();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Handle cold-start: app opened by tapping a notification
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      handleNotificationResponse(response);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});

    // Foreground: FCM delivers notification while app is open → show banner
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[Push] Foreground FCM notification received:', notification.request.content.title);
      const { title, body, data } = notification.request.content;
      setActiveNotification({
        title: title ?? undefined,
        body: body ?? undefined,
        data: (data as Record<string, unknown>) ?? undefined,
      });
      // Refresh badge count immediately
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    });

    // Tap-to-navigate: user taps notification in tray → show banner + navigate
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationResponse(response);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // AppState listener: refresh badge when app comes to foreground from background/killed
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="package/[id]"
          options={{ headerShown: true, title: "Package Details", headerTintColor: "#047857" }}
        />
        <Stack.Screen
          name="booking/create"
          options={{ headerShown: true, title: "Create Booking", headerTintColor: "#047857" }}
        />
        <Stack.Screen
          name="booking/[id]"
          options={{ headerShown: true, title: "Booking Details", headerTintColor: "#047857" }}
        />
        <Stack.Screen
          name="travel-kit"
          options={{ headerShown: true, title: "Complimentary Travel Kit", headerTintColor: "#047857" }}
        />
      </Stack>
      <InAppNotificationBanner
        notification={activeNotification}
        onDismiss={() => {
          setActiveNotification(null);
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        }}
        onPress={handleBannerPress}
      />
    </>
  );
}

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppProviders>
            <RootLayoutNav />
            <StatusBar style="dark" />
          </AppProviders>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
