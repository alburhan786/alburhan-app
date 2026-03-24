import { Feather } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";

export type PaymentResult = "success" | "failure" | "dismissed";

interface PaymentModalProps {
  visible: boolean;
  checkoutUrl: string;
  onResult: (result: PaymentResult) => void;
  bookingNumber: string;
}

export function PaymentModal({ visible, checkoutUrl, onResult, bookingNumber }: PaymentModalProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string; status?: string };
      if (data.type === "payment_success") {
        onResult("success");
      } else if (data.type === "payment_failure") {
        onResult("failure");
      } else if (data.type === "payment_dismissed") {
        onResult("dismissed");
      }
    } catch {
    }
  }, [onResult]);

  const handleNavigationStateChange = useCallback((state: { url: string }) => {
    if (state.url.startsWith("alburhan://")) {
      onResult("success");
    }
  }, [onResult]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onResult("dismissed")}>
      <View style={[styles.container, { paddingTop: Platform.OS === "ios" ? insets.top : 0 }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Secure Payment</Text>
            <Text style={styles.headerSub}>Booking #{bookingNumber}</Text>
          </View>
          <Pressable onPress={() => onResult("dismissed")} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={COLORS.text} />
          </Pressable>
        </View>

        <View style={styles.secureBar}>
          <Feather name="lock" size={12} color={COLORS.success} />
          <Text style={styles.secureText}>256-bit SSL • Powered by Razorpay</Text>
        </View>

        {loading && !loadError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.darkGreen} />
            <Text style={styles.loadingText}>Loading payment gateway…</Text>
          </View>
        )}

        {loadError ? (
          <View style={styles.errorBox}>
            <Feather name="wifi-off" size={40} color={COLORS.border} />
            <Text style={styles.errorTitle}>Could not load payment page</Text>
            <Text style={styles.errorSub}>Check your connection and try again</Text>
            <Pressable
              onPress={() => { setLoadError(false); setLoading(true); webViewRef.current?.reload(); }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            source={{ uri: checkoutUrl }}
            style={styles.webView}
            onLoadStart={() => { setLoading(true); setLoadError(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setLoadError(true); }}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationStateChange}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            originWhitelist={["https://*", "alburhan://*"]}
            userAgent="AlBurhanApp/1.0 Mobile RazorpayCheckout"
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  headerLeft: { gap: 2 },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  closeBtn: {
    padding: 4,
  },
  secureBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.successBg,
  },
  secureText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: COLORS.success,
  },
  webView: {
    flex: 1,
    backgroundColor: "#F7F5F0",
  },
  loadingOverlay: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 12,
    zIndex: 10,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
    marginTop: 8,
  },
  errorSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
