import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import { PaymentModal, PaymentResult } from "@/components/PaymentModal";
import { useListBookings } from "@workspace/api-client-react";

interface Booking {
  id: string;
  bookingNumber: string;
  packageName?: string | null;
  groupName?: string | null;
  customerName: string;
  numberOfPilgrims: number;
  status: string;
  finalAmount?: number | null;
  paidAmount?: number | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; color: string }> = {
    pending: { label: "Pending Review", bg: COLORS.pendingBg, color: COLORS.pending },
    approved: { label: "Approved", bg: COLORS.approvedBg, color: COLORS.approved },
    confirmed: { label: "Confirmed", bg: COLORS.confirmedBg, color: COLORS.confirmed },
    rejected: { label: "Rejected", bg: COLORS.rejectedBg, color: COLORS.rejected },
    cancelled: { label: "Cancelled", bg: "#F3F4F6", color: "#6B7280" },
    partially_paid: { label: "Partially Paid", bg: COLORS.partiallyPaidBg, color: COLORS.partiallyPaid },
  };
  const c = config[status] ?? config.pending;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: c.color }]} />
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function BookingCard({ booking, onPay }: { booking: Booking; onPay: (b: Booking) => void }) {
  const canPay = booking.status === "approved" || booking.status === "partially_paid";
  const finalAmount = Number(booking.finalAmount ?? 0);
  const paidAmount = Number(booking.paidAmount ?? 0);
  const remaining = finalAmount - paidAmount;

  const getStatusMsg = () => {
    switch (booking.status) {
      case "pending": return "Under review — our team will contact you soon";
      case "approved": return "Please complete payment to confirm your booking";
      case "confirmed": return "Your journey is confirmed. Jazak Allah Khair!";
      case "rejected": return "Contact us for more information";
      case "partially_paid": return `Remaining balance: ₹${remaining.toLocaleString("en-IN")}`;
      default: return "";
    }
  };

  return (
    <View style={styles.bookingCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.bookingNumber}>#{booking.bookingNumber}</Text>
          <StatusBadge status={booking.status} />
        </View>
        <Text style={styles.cardDate}>
          {new Date(booking.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      </View>

      <Text style={styles.cardPackage} numberOfLines={1}>
        {booking.packageName || booking.groupName || "Al Burhan Umrah Package"}
      </Text>

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Feather name="users" size={13} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{booking.numberOfPilgrims} Pilgrim{booking.numberOfPilgrims > 1 ? "s" : ""}</Text>
        </View>
        {finalAmount > 0 && (
          <View style={styles.metaItem}>
            <Feather name="credit-card" size={13} color={COLORS.textMuted} />
            <Text style={styles.metaText}>₹{finalAmount.toLocaleString("en-IN")}</Text>
          </View>
        )}
      </View>

      <View style={styles.statusMsgRow}>
        <Feather
          name={booking.status === "confirmed" ? "check-circle" : booking.status === "rejected" ? "x-circle" : "clock"}
          size={12}
          color={booking.status === "confirmed" ? COLORS.success : booking.status === "rejected" ? COLORS.error : COLORS.textMuted}
        />
        <Text style={[styles.statusMsg, booking.status === "confirmed" && { color: COLORS.success }]}>
          {getStatusMsg()}
        </Text>
      </View>

      {canPay && remaining > 0 && (
        <Pressable
          onPress={() => onPay(booking)}
          style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        >
          <Feather name="credit-card" size={15} color="#fff" />
          <Text style={styles.payBtnText}>
            Pay {booking.status === "partially_paid" ? `₹${remaining.toLocaleString("en-IN")} Due` : "Now"}
          </Text>
        </Pressable>
      )}

      {booking.status === "confirmed" && (
        <View style={styles.confirmedBanner}>
          <Feather name="check-circle" size={15} color={COLORS.confirmed} />
          <Text style={styles.confirmedText}>Booking Fully Confirmed</Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, baseUrl } = useAuth();
  const { data, isLoading, refetch } = useListBookings();
  const [refreshing, setRefreshing] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{ url: string; bookingNumber: string } | null>(null);

  type BookingListData = { bookings: Booking[] };
  const bookings: Booking[] = (data as BookingListData | undefined)?.bookings ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const initiatePayment = useCallback(async (booking: Booking, payAmount?: number) => {
    setPayingId(booking.id);
    try {
      const res = await fetch(`${baseUrl}/api/payments/create-order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, payAmount }),
      });

      type OrderResponse = { orderId: string; amount: number; message?: string };
      const order: OrderResponse = await res.json();
      if (!res.ok) throw new Error(order.message || "Failed to create order");

      const params = new URLSearchParams({
        orderId: order.orderId,
        bookingId: booking.id,
        amount: String(order.amount),
        name: booking.customerName,
        mobile: user?.mobile ?? "",
        bookingNumber: booking.bookingNumber,
      });

      const checkoutUrl = `${baseUrl}/api/payments/checkout-page?${params.toString()}`;
      setPaymentModal({ url: checkoutUrl, bookingNumber: booking.bookingNumber });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not initiate payment. Please try again.";
      Alert.alert("Payment Error", msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPayingId(null);
    }
  }, [baseUrl, user]);

  const handlePay = useCallback(async (booking: Booking) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const finalAmount = Number(booking.finalAmount ?? 0);
    const paidAmount = Number(booking.paidAmount ?? 0);
    const remaining = finalAmount - paidAmount;

    if (booking.status === "partially_paid" && remaining > 0) {
      Alert.alert(
        "Choose Payment Amount",
        `Remaining balance: ₹${remaining.toLocaleString("en-IN")}\nTotal amount: ₹${finalAmount.toLocaleString("en-IN")}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Pay Remaining ₹${remaining.toLocaleString("en-IN")}`,
            onPress: () => initiatePayment(booking, remaining),
          },
          {
            text: `Pay Full ₹${finalAmount.toLocaleString("en-IN")}`,
            onPress: () => initiatePayment(booking, finalAmount),
          },
        ]
      );
    } else {
      await initiatePayment(booking);
    }
  }, [initiatePayment]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: COLORS.background }]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.darkGreen} />
      }
    >
      {/* Header */}
      <View style={[styles.headerBanner, { paddingTop: topPad + 20 }]}>
        <View>
          <Text style={styles.greetText}>Assalamu Alaikum,</Text>
          <Text style={styles.userName}>{user?.name || "Pilgrim"} ✦</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {(user?.name ?? "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Brand card */}
      <View style={styles.brandCard}>
        <View style={styles.brandCardInner}>
          <Feather name="compass" size={18} color={COLORS.gold} />
          <View style={styles.brandCardText}>
            <Text style={styles.brandCardTitle}>Al Burhan Tours & Travels</Text>
            <Text style={styles.brandCardSub}>35+ Years of Trusted Hajj & Umrah Service</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Bookings</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{bookings.length}</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.darkGreen} />
            <Text style={styles.loadingText}>Loading bookings…</Text>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="compass" size={40} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Bookings Yet</Text>
            <Text style={styles.emptyText}>
              Contact us to plan your sacred journey
            </Text>
            <Pressable
              onPress={() => Linking.openURL("tel:+918989701701")}
              style={styles.callBtn}
            >
              <Feather name="phone" size={15} color={COLORS.darkGreen} />
              <Text style={styles.callBtnText}>Call Us Now</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                onPay={handlePay}
              />
            ))}
          </View>
        )}
      </View>

      {/* Contact section */}
      <View style={styles.contactSection}>
        <Text style={styles.contactTitle}>Need Help?</Text>
        <View style={styles.contactButtons}>
          <Pressable
            onPress={() => Linking.openURL("tel:+918989701701")}
            style={styles.contactBtn}
          >
            <Feather name="phone" size={16} color={COLORS.darkGreen} />
            <Text style={styles.contactBtnText}>Call</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("https://wa.me/918989701701")}
            style={styles.contactBtn}
          >
            <Feather name="message-circle" size={16} color={COLORS.darkGreen} />
            <Text style={styles.contactBtnText}>WhatsApp</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ height: Platform.OS === "web" ? 34 : insets.bottom + 100 }} />
    </ScrollView>

    {paymentModal && (
      <PaymentModal
        visible={!!paymentModal}
        checkoutUrl={paymentModal.url}
        bookingNumber={paymentModal.bookingNumber}
        onResult={(result: PaymentResult) => {
          setPaymentModal(null);
          if (result === "success") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          refetch();
        }}
      />
    )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBanner: {
    backgroundColor: COLORS.darkGreen,
    paddingHorizontal: 24,
    paddingBottom: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  greetText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginBottom: 2,
  },
  userName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
  },
  brandCard: {
    marginHorizontal: 16,
    marginTop: -14,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  brandCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandCardText: { flex: 1 },
  brandCardTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: COLORS.darkGreen,
  },
  brandCardSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
  },
  countBadge: {
    backgroundColor: COLORS.darkGreen,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    textAlign: "center",
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  callBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.darkGreen,
  },
  bookingsList: { gap: 12 },
  bookingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeaderLeft: { gap: 6 },
  bookingNumber: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  cardDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  cardPackage: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: COLORS.text,
    marginBottom: 8,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textSecondary,
  },
  statusMsgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginBottom: 4,
  },
  statusMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    flex: 1,
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.darkGreen,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 12,
    shadowColor: COLORS.darkGreen,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  payBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.confirmedBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  confirmedText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.confirmed,
  },
  contactSection: {
    margin: 16,
    marginTop: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  contactButtons: {
    flexDirection: "row",
    gap: 12,
  },
  contactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: COLORS.darkGreen,
  },
});
