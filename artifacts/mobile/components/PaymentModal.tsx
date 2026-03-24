import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS } from "@/constants/colors";

export type PaymentResult = "success" | "failure" | "dismissed";

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: {
    name: string;
    contact: string;
  };
  theme: { color: string };
}

interface PaymentModalProps {
  visible: boolean;
  checkoutUrl: string;
  razorpayOptions: RazorpayOptions;
  onResult: (result: PaymentResult, paymentId?: string) => void;
  bookingNumber: string;
}

type RazorpaySuccess = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayError = { code: number; description: string };

let RazorpayCheckout: { open: (opts: RazorpayOptions) => Promise<RazorpaySuccess> } | null = null;

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-razorpay") as { default: { open: (opts: RazorpayOptions) => Promise<RazorpaySuccess> } };
    RazorpayCheckout = mod.default ?? (mod as unknown as { open: (opts: RazorpayOptions) => Promise<RazorpaySuccess> });
  } catch {
    RazorpayCheckout = null;
  }
}

function WebFallbackModal({
  visible,
  checkoutUrl,
  bookingNumber,
  onResult,
}: {
  visible: boolean;
  checkoutUrl: string;
  bookingNumber: string;
  onResult: (result: PaymentResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const webViewRef = useRef<import("react-native-webview").WebView>(null);

  const [WebView, setWebView] = useState<typeof import("react-native-webview").WebView | null>(null);

  useEffect(() => {
    import("react-native-webview").then((mod) => {
      setWebView(() => mod.WebView as typeof import("react-native-webview").WebView);
    }).catch(() => {});
  }, []);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string };
      if (data.type === "payment_success") onResult("success");
      else if (data.type === "payment_failure") onResult("failure");
      else if (data.type === "payment_dismissed") onResult("dismissed");
    } catch {
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
        ) : WebView ? (
          <WebView
            ref={webViewRef}
            source={{ uri: checkoutUrl }}
            style={styles.webView}
            onLoadStart={() => { setLoading(true); setLoadError(false); }}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setLoadError(true); }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["https://*", "alburhan://*"]}
            userAgent="AlBurhanApp/1.0 Mobile RazorpayCheckout"
          />
        ) : (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.darkGreen} />
          </View>
        )}
      </View>
    </Modal>
  );
}

export function PaymentModal({
  visible,
  checkoutUrl,
  razorpayOptions,
  onResult,
  bookingNumber,
}: PaymentModalProps) {
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    if (!visible || launched) return;
    if (Platform.OS === "web" || !RazorpayCheckout) return;

    setLaunched(true);

    RazorpayCheckout.open(razorpayOptions)
      .then((data: RazorpaySuccess) => {
        onResult("success", data.razorpay_payment_id);
      })
      .catch((error: RazorpayError) => {
        if (error.code === 0) {
          onResult("dismissed");
        } else {
          Alert.alert(
            "Payment Failed",
            error.description || "The payment could not be processed. Please try again.",
            [{ text: "OK", onPress: () => onResult("failure") }],
          );
        }
      });
  }, [visible, launched, razorpayOptions, onResult]);

  useEffect(() => {
    if (!visible) setLaunched(false);
  }, [visible]);

  if (Platform.OS === "web" || !RazorpayCheckout) {
    return (
      <WebFallbackModal
        visible={visible}
        checkoutUrl={checkoutUrl}
        bookingNumber={bookingNumber}
        onResult={onResult}
      />
    );
  }

  return null;
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
  closeBtn: { padding: 4 },
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
  border: { borderColor: COLORS.border },
});
