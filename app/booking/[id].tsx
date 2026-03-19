import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { bookingService, paymentService } from '../../services/api';
import { Colors } from '../../constants/Colors';
import { getApiUrl } from '../../lib/query-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BookingDetailsScreen() {
  const { id } = useLocalSearchParams();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPaymentWebView, setShowPaymentWebView] = useState(false);
  const [razorpayHtml, setRazorpayHtml] = useState('');
  const [currentOrderId, setCurrentOrderId] = useState('');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadBooking();
  }, [id]);

  const MAX_PER_TXN = 500000;

  const loadBooking = async () => {
    try {
      const response = await bookingService.getBookingById(parseInt(id as string));
      if (response.success) {
        setBooking(response.booking);
        const remaining = parseFloat(response.booking.totalAmount) - parseFloat(response.booking.paidAmount);
        setPaymentAmount(Math.min(remaining, MAX_PER_TXN).toString());
      }
    } catch (error) {
      Alert.alert('Error', 'Could not load booking');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(parseFloat(price));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const buildRazorpayHtml = (orderId: string, amount: number, keyId: string) => {
    const amountInPaise = Math.round(amount * 100);
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body {
      margin: 0; padding: 0;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh;
      background: #F0FDF4;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .loading { text-align: center; color: #047857; font-size: 18px; }
    .spinner { border: 4px solid #E5E7EB; border-top: 4px solid #047857; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>Opening Payment Gateway...</p>
  </div>
  <script>
    var options = {
      key: "${keyId}",
      amount: ${amountInPaise},
      currency: "INR",
      name: "AL BURHAN TOURS",
      description: "Booking #${booking?.id} Payment",
      order_id: "${orderId}",
      handler: function(response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "payment_success",
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature
        }));
      },
      prefill: {
        name: "${booking?.contactName || ''}",
        email: "${booking?.contactEmail || ''}",
        contact: "${booking?.contactPhone || ''}"
      },
      theme: { color: "#047857" },
      modal: {
        ondismiss: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "payment_cancelled" }));
        }
      }
    };
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(response) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "payment_failed",
        error: response.error.description
      }));
    });
    rzp.open();
  </script>
</body>
</html>`;
  };

  const handlePayment = async () => {
    const amount = parseFloat(paymentAmount);
    const remaining = parseFloat(booking.totalAmount) - parseFloat(booking.paidAmount);

    if (!amount || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (amount > remaining) {
      Alert.alert('Error', `Amount cannot exceed remaining balance of ${formatPrice(remaining.toString())}`);
      return;
    }

    setProcessing(true);
    try {
      const orderResponse = await paymentService.createOrder(booking.id, amount);

      if (orderResponse.success) {
        if (orderResponse.keyId) {
          const html = buildRazorpayHtml(orderResponse.orderId, amount, orderResponse.keyId);
          setRazorpayHtml(html);
          setCurrentOrderId(orderResponse.orderId);
          setShowPaymentWebView(true);
        } else {
          Alert.alert(
            'Razorpay Not Configured',
            'Razorpay API keys are not set. Payment gateway is unavailable.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert('Payment Error', orderResponse.error || 'Could not initiate payment. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'payment_success') {
        setShowPaymentWebView(false);
        setProcessing(true);
        try {
          const verifyResponse = await paymentService.verifyPayment({
            bookingId: booking.id,
            razorpayOrderId: data.razorpay_order_id,
            razorpayPaymentId: data.razorpay_payment_id,
            razorpaySignature: data.razorpay_signature,
            amount: paymentAmount,
          });

          if (verifyResponse.success) {
            Alert.alert('Payment Successful', 'Your payment has been verified and confirmed!', [
              { text: 'OK', onPress: loadBooking }
            ]);
          } else {
            Alert.alert('Verification Failed', verifyResponse.error || 'Payment verification failed');
          }
        } catch (error: any) {
          Alert.alert('Error', error.message || 'Payment verification failed');
        } finally {
          setProcessing(false);
        }
      } else if (data.type === 'payment_failed') {
        setShowPaymentWebView(false);
        Alert.alert('Payment Failed', data.error || 'Payment was not completed');
      } else if (data.type === 'payment_cancelled') {
        setShowPaymentWebView(false);
      }
    } catch (e) {
      console.error('WebView message parse error:', e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!booking) {
    return null;
  }

  const remainingAmount = parseFloat(booking.totalAmount) - parseFloat(booking.paidAmount);

  const apiBase = getApiUrl().replace('/api', '');
  const invoiceUrl = `${apiBase}/invoice/${booking.id}`;

  const handleViewInvoice = () => {
    Linking.openURL(invoiceUrl).catch(() =>
      Alert.alert('Error', 'Could not open invoice')
    );
  };

  const handleShareInvoice = async () => {
    try {
      await Share.share({
        message: `Al Burhan Tours & Travels\nBooking #${booking.id}\nInvoice: ${invoiceUrl}`,
        url: invoiceUrl,
        title: `Invoice - Booking #${booking.id}`,
      });
    } catch {}
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.bookingId}>Booking #{booking.id}</Text>
            {booking.invoiceNumber && (
              <Text style={styles.invoiceNum}>Invoice: {booking.invoiceNumber}</Text>
            )}
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.invoiceActions}>
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleViewInvoice}>
            <Ionicons name="document-text-outline" size={18} color="#047857" />
            <Text style={styles.invoiceBtnText}>View Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.invoiceBtn, styles.invoiceBtnShare]} onPress={handleShareInvoice}>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={[styles.invoiceBtnText, { color: '#fff' }]}>Share Invoice</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Details</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Booking Date:</Text>
              <Text style={styles.value}>{formatDate(booking.bookingDate)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Number of Travelers:</Text>
              <Text style={styles.value}>{booking.numberOfPeople}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Name:</Text>
              <Text style={styles.value}>{booking.contactName}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Phone:</Text>
              <Text style={styles.value}>{booking.contactPhone}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{booking.contactEmail}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Travelers</Text>
          {booking.travelers.map((traveler: any, index: number) => (
            <View key={index} style={styles.card}>
              <Text style={styles.travelerTitle}>Traveler {index + 1}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Name:</Text>
                <Text style={styles.value}>{traveler.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Age:</Text>
                <Text style={styles.value}>{traveler.age}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Passport:</Text>
                <Text style={styles.value}>{traveler.passportNumber}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Information</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Total Amount:</Text>
              <Text style={[styles.value, styles.boldValue]}>{formatPrice(booking.totalAmount)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Paid Amount:</Text>
              <Text style={[styles.value, { color: Colors.success }]}>{formatPrice(booking.paidAmount)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={[styles.label, styles.boldLabel]}>Remaining:</Text>
              <Text style={[styles.value, styles.boldValue, { color: Colors.error }]}>
                {formatPrice(remainingAmount.toString())}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Payment Status:</Text>
              <View style={styles.paymentBadge}>
                <Text style={styles.paymentText}>{booking.paymentStatus.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {booking.paymentStatus !== 'completed' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Make Payment</Text>
            <View style={styles.card}>
              <View style={styles.installmentNote}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                <Text style={styles.installmentNoteText}>
                  Max ₹5,00,000 per transaction. Pay in installments for larger amounts.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Select or Enter Amount</Text>
              <View style={styles.presetRow}>
                {[25000, 50000, 100000, 200000, 500000].map((preset) => {
                  const isDisabled = preset > remainingAmount;
                  const isSelected = paymentAmount === preset.toString();
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.presetBtn, isSelected && styles.presetBtnActive, isDisabled && styles.presetBtnDisabled]}
                      onPress={() => !isDisabled && setPaymentAmount(preset.toString())}
                      disabled={isDisabled}
                    >
                      <Text style={[styles.presetBtnText, isSelected && styles.presetBtnTextActive]}>
                        ₹{preset >= 100000 ? `${preset / 100000}L` : `${preset / 1000}K`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.presetBtn, paymentAmount === Math.min(remainingAmount, 500000).toString() && remainingAmount <= 500000 && styles.presetBtnActive]}
                  onPress={() => setPaymentAmount(Math.min(remainingAmount, 500000).toString())}
                >
                  <Text style={[styles.presetBtnText, paymentAmount === Math.min(remainingAmount, 500000).toString() && remainingAmount <= 500000 && styles.presetBtnTextActive]}>Full</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                placeholder="Or enter custom amount"
              />

              <TouchableOpacity
                style={[styles.payButton, processing && styles.payButtonDisabled]}
                onPress={handlePayment}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={styles.payButtonRow}>
                    <Ionicons name="card-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.payButtonText}>Pay with Razorpay</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showPaymentWebView}
        animationType="slide"
        onRequestClose={() => setShowPaymentWebView(false)}
      >
        <View style={styles.webViewContainer}>
          <View style={[styles.webViewHeader, { paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8 }]}>
            <TouchableOpacity
              onPress={() => setShowPaymentWebView(false)}
              style={styles.webViewCloseButton}
            >
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.webViewTitle}>Razorpay Payment</Text>
            <View style={{ width: 40 }} />
          </View>
          {Platform.OS === 'web' ? (
            <View style={styles.webFallback}>
              <Ionicons name="card-outline" size={48} color={Colors.primary} />
              <Text style={styles.webFallbackTitle}>Payment Gateway</Text>
              <Text style={styles.webFallbackText}>
                Razorpay checkout opens in a WebView on mobile devices. On web, please use the mobile app for payment.
              </Text>
              <TouchableOpacity
                style={styles.webFallbackButton}
                onPress={() => setShowPaymentWebView(false)}
              >
                <Text style={styles.webFallbackButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <WebView
              source={{ html: razorpayHtml }}
              onMessage={handleWebViewMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: Colors.card, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  bookingId: { fontSize: 20, fontWeight: 'bold' as const, color: Colors.text },
  invoiceNum: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  statusText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' as const },
  invoiceActions: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: '#f0fdf4', borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  invoiceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#047857', backgroundColor: '#fff' },
  invoiceBtnShare: { backgroundColor: '#047857' },
  invoiceBtnText: { fontSize: 14, fontWeight: '700' as const, color: '#047857' },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold' as const, color: Colors.text, marginBottom: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, alignItems: 'center' },
  label: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  value: { fontSize: 14, fontWeight: '600' as const, color: Colors.text, flex: 1, textAlign: 'right' as const },
  boldLabel: { fontWeight: 'bold' as const, fontSize: 16, color: Colors.text },
  boldValue: { fontWeight: 'bold' as const, fontSize: 16 },
  travelerTitle: { fontSize: 16, fontWeight: 'bold' as const, color: Colors.text, marginBottom: 8 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
  paymentBadge: { backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  paymentText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' as const },
  installmentNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10, marginBottom: 14 },
  installmentNoteText: { fontSize: 12, color: Colors.primary, flex: 1, lineHeight: 16 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background },
  presetBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  presetBtnDisabled: { opacity: 0.35 },
  presetBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' as const },
  presetBtnTextActive: { color: Colors.primary },
  inputLabel: { fontSize: 14, color: Colors.text, marginBottom: 8, fontWeight: '600' as const },
  input: { backgroundColor: Colors.background, borderRadius: 8, padding: 12, fontSize: 16, color: Colors.text, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  payButton: { backgroundColor: '#3399CC', padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  payButtonDisabled: { opacity: 0.6 },
  payButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' as const },
  webViewContainer: { flex: 1, backgroundColor: Colors.background },
  webViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  webViewCloseButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  webViewTitle: { fontSize: 17, fontWeight: '600' as const, color: Colors.text },
  webViewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  webFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  webFallbackTitle: { fontSize: 20, fontWeight: 'bold' as const, color: Colors.text, marginTop: 16 },
  webFallbackText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' as const, marginTop: 8, lineHeight: 20 },
  webFallbackButton: { backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8, marginTop: 24 },
  webFallbackButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' as const },
});
