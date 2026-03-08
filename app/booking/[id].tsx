import React, { useState, useEffect } from 'react';
  import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    TextInput,
  } from 'react-native';
  import { useLocalSearchParams, useRouter } from 'expo-router';
  import { bookingService, paymentService } from '../../services/api';
  import { Colors } from '../../constants/Colors';

  export default function BookingDetailsScreen() {
    const { id } = useLocalSearchParams();
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [processing, setProcessing] = useState(false);
    const router = useRouter();

    useEffect(() => {
      loadBooking();
    }, [id]);

    const loadBooking = async () => {
      try {
        const response = await bookingService.getBookingById(parseInt(id as string));
        if (response.success) {
          setBooking(response.booking);
          const remaining = parseFloat(response.booking.totalAmount) - parseFloat(response.booking.paidAmount);
          setPaymentAmount(remaining.toString());
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
        // Create Razorpay order
        const orderResponse = await paymentService.createOrder(booking.id, amount);
        
        if (orderResponse.success) {
          // Simulate payment success (in real app, Razorpay SDK would be used)
          Alert.alert(
            'Payment Simulation',
            `This is a demo. In production, Razorpay payment gateway would be integrated here.\n\nAmount: ${formatPrice(amount.toString())}`,
            [
              {
                text: 'Simulate Success',
                onPress: async () => {
                  try {
                    const verifyResponse = await paymentService.verifyPayment({
                      bookingId: booking.id,
                      razorpayOrderId: orderResponse.orderId,
                      razorpayPaymentId: `pay_${Date.now()}`,
                      razorpaySignature: 'demo_signature',
                      amount: amount.toString(),
                    });

                    if (verifyResponse.success) {
                      Alert.alert('Success', 'Payment completed successfully!', [
                        { text: 'OK', onPress: loadBooking }
                      ]);
                    }
                  } catch (error: any) {
                    Alert.alert('Error', error.message);
                  }
                },
              },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Payment failed');
      } finally {
        setProcessing(false);
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

    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.bookingId}>Booking #{booking.id}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
          </View>
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
              <Text style={styles.inputLabel}>Payment Amount (₹)</Text>
              <TextInput
                style={styles.input}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="numeric"
                placeholder="Enter amount"
              />
              <TouchableOpacity
                style={[styles.payButton, processing && styles.payButtonDisabled]}
                onPress={handlePayment}
                disabled={processing}
              >
                <Text style={styles.payButtonText}>
                  {processing ? 'Processing...' : 'Pay Now'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.note}>
                💡 Note: In production, this will integrate with Razorpay payment gateway
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { backgroundColor: Colors.card, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
    bookingId: { fontSize: 20, fontWeight: 'bold', color: Colors.text },
    statusBadge: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    statusText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
    section: { padding: 16 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text, marginBottom: 12 },
    card: { backgroundColor: Colors.card, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, alignItems: 'center' },
    label: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
    value: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1, textAlign: 'right' },
    boldLabel: { fontWeight: 'bold', fontSize: 16, color: Colors.text },
    boldValue: { fontWeight: 'bold', fontSize: 16 },
    travelerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 8 },
    divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },
    paymentBadge: { backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
    paymentText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
    inputLabel: { fontSize: 14, color: Colors.text, marginBottom: 8, fontWeight: '600' },
    input: { backgroundColor: Colors.background, borderRadius: 8, padding: 12, fontSize: 16, color: Colors.text, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
    payButton: { backgroundColor: Colors.secondary, padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
    payButtonDisabled: { opacity: 0.6 },
    payButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
    note: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', fontStyle: 'italic' },
  });
  