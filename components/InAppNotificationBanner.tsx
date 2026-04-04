import { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface NotificationData {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

interface Props {
  notification: NotificationData | null;
  onDismiss: () => void;
  onPress?: (data?: Record<string, unknown>) => void;
}

const AUTO_DISMISS_MS = 6000;

export function InAppNotificationBanner({ notification, onDismiss, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    setVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();

    timerRef.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification]);

  function dismiss() {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      onDismiss();
    });
  }

  function handlePress() {
    dismiss();
    if (onPress) onPress(notification?.data);
  }

  if (!visible || !notification) return null;

  const topOffset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: topOffset + 8, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity activeOpacity={0.92} onPress={handlePress} style={styles.inner}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={22} color="#fff" />
        </View>
        <View style={styles.textWrap}>
          {notification.title ? (
            <Text style={styles.title} numberOfLines={1}>
              {notification.title}
            </Text>
          ) : null}
          {notification.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {notification.body}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  inner: {
    backgroundColor: "#065f46",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  body: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  closeBtn: {
    padding: 2,
    flexShrink: 0,
  },
});
