import React, { useState, useEffect } from 'react';
  import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
  } from 'react-native';
  import { useRouter } from 'expo-router';
  import { bookingService } from '../../services/api';
  import { useAuth } from '../../contexts/AuthContext';
  import { Colors } from '../../constants/Colors';

  export default function BookingsScreen() {
    const [bookings, setBookings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (user) {
        loadBookings();
      }
    }, [user]);

    const loadBookings = async () => {
      try {
        const response = await bookingService.getUserBookings(user!.id);
        if (response.success) {
          setBookings(response.bookings);
        }
      } catch (error) {
        console.error('Error loading bookings:', error);
        Alert.alert('Error', 'Could not load bookings');
      } finally {
        setLoading(false);
      }
    };

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'confirmed':
          return Colors.success;
        case 'pending':
          return Colors.warning;
        case 'cancelled':
          return Colors.error;
        case 'completed':
          return Colors.primary;
        default:
          return Colors.textSecondary;
      }
    };

    const getPaymentStatusColor = (status: string) => {
      switch (status) {
        case 'completed':
          return Colors.success;
        case 'partial':
          return Colors.warning;
        case 'pending':
          return Colors.error;
        default:
          return Colors.textSecondary;
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
        month: 'short',
        day: 'numeric',
      });
    };

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Bookings</Text>
        </View>

        <ScrollView style={styles.content}>
          {bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No bookings yet</Text>
              <Text style={styles.emptyStateText}>
                Start planning your spiritual journey by browsing our packages
              </Text>
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push('/(tabs)')}
              >
                <Text style={styles.browseButtonText}>Browse Packages</Text>
              </TouchableOpacity>
            </View>
          ) : (
            bookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                onPress={() => router.push(`/booking/${booking.id}`)}
              >
                <View style={styles.bookingHeader}>
                  <Text style={styles.bookingId}>Booking #{booking.id}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(booking.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {booking.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Booking Date:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(booking.bookingDate)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Travelers:</Text>
                    <Text style={styles.detailValue}>
                      {booking.numberOfPeople} person{booking.numberOfPeople !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Total Amount:</Text>
                    <Text style={styles.detailValue}>
                      {formatPrice(booking.totalAmount)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Paid Amount:</Text>
                    <Text style={[styles.detailValue, { color: Colors.success }]}>
                      {formatPrice(booking.paidAmount)}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Status:</Text>
                    <View
                      style={[
                        styles.paymentBadge,
                        { backgroundColor: getPaymentStatusColor(booking.paymentStatus) },
                      ]}
                    >
                      <Text style={styles.paymentText}>
                        {booking.paymentStatus.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                {booking.paymentStatus !== 'completed' && (
                  <TouchableOpacity
                    style={styles.payButton}
                    onPress={() => router.push(`/booking/${booking.id}`)}
                  >
                    <Text style={styles.payButtonText}>
                      Complete Payment
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      backgroundColor: Colors.primary,
      padding: 20,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#FFFFFF',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      color: Colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    browseButton: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    browseButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
    bookingCard: {
      backgroundColor: Colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    bookingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    bookingId: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    statusText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    bookingDetails: {
      gap: 12,
      marginBottom: 16,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      fontSize: 14,
      color: Colors.textSecondary,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
    },
    paymentBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 6,
    },
    paymentText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    payButton: {
      backgroundColor: Colors.secondary,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    payButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
  