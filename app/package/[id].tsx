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
  import { useLocalSearchParams, useRouter } from 'expo-router';
  import { packageService } from '../../services/api';
  import { useAuth } from '../../contexts/AuthContext';
  import { Colors } from '../../constants/Colors';

  export default function PackageDetailsScreen() {
    const { id } = useLocalSearchParams();
    const [pkg, setPkg] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
      loadPackage();
    }, [id]);

    const loadPackage = async () => {
      try {
        const response = await packageService.getPackageById(parseInt(id as string));
        if (response.success) {
          setPkg(response.package);
        }
      } catch (error) {
        console.error('Error loading package:', error);
        Alert.alert('Error', 'Could not load package details');
      } finally {
        setLoading(false);
      }
    };

    const formatPrice = (price: string | number) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(typeof price === 'number' ? price : parseFloat(price));
    };

    const roomPriceLabels: Record<string, string> = {
      double: 'Double Sharing',
      triple: 'Triple Sharing',
      quad: 'Quad Sharing',
      sharing: '5 Sharing',
      '6_sharing': '6 Sharing',
    };

    const formatDate = (date: string) => {
      return new Date(date).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const handleBookNow = () => {
      if (!user) {
        Alert.alert('Login Required', 'Please login to book this package', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Login', onPress: () => router.push('/(auth)/login') },
        ]);
        return;
      }

      router.push({
        pathname: '/booking/create',
        params: { packageId: id },
      });
    };

    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (!pkg) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Package not found</Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ScrollView style={styles.content}>
          <View style={styles.header}>
            <View style={styles.badges}>
              <View style={styles.typeBadge}>
                <Text style={styles.badgeText}>{pkg.type.toUpperCase()}</Text>
              </View>
              {pkg.category && (
                <View style={[styles.typeBadge, { backgroundColor: '#6366f1' }]}>
                  <Text style={styles.badgeText}>{pkg.category}</Text>
                </View>
              )}
              {pkg.featured && (
                <View style={styles.featuredBadge}>
                  <Text style={styles.badgeText}>★ FEATURED</Text>
                </View>
              )}
            </View>
            <Text style={styles.packageName}>{pkg.name}</Text>
            <Text style={styles.description}>{pkg.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Package Details</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{pkg.duration}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Departure</Text>
                <Text style={styles.detailValue}>{formatDate(pkg.departureDate)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Return</Text>
                <Text style={styles.detailValue}>{formatDate(pkg.returnDate)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Available Seats</Text>
                <Text style={[styles.detailValue, { color: Colors.success }]}>
                  {pkg.availableSeats} seats
                </Text>
              </View>
            </View>
          </View>

          {pkg.roomPrices && Object.keys(pkg.roomPrices).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Room Pricing</Text>
              <View style={styles.detailsCard}>
                {Object.entries(pkg.roomPrices).map(([key, val]: [string, any], idx: number) => (
                  <React.Fragment key={key}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{roomPriceLabels[key] || key}</Text>
                      <Text style={[styles.detailValue, { color: Colors.primary, fontWeight: 'bold' as const }]}>
                        {formatPrice(val)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {(pkg.flight || pkg.food || pkg.tent || pkg.transport || pkg.muallim) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Services</Text>
              <View style={styles.detailsCard}>
                {[
                  { label: 'Flight', value: pkg.flight },
                  { label: 'Muallim', value: pkg.muallim },
                  { label: 'Tent / Mina', value: pkg.tent },
                  { label: 'Transport', value: pkg.transport },
                  { label: 'Meals', value: pkg.food },
                  { label: 'Room Sharing', value: pkg.roomSharing },
                ].filter(s => s.value).map((s, idx, arr) => (
                  <React.Fragment key={s.label}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{s.label}</Text>
                      <Text style={[styles.detailValue, { flex: 1, textAlign: 'right' as const, marginLeft: 16 }]}>{s.value}</Text>
                    </View>
                    {idx < arr.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {pkg.hotelDetails && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hotel Accommodations</Text>
              <View style={styles.hotelCard}>
                <Text style={styles.hotelCity}>Makkah</Text>
                <Text style={styles.hotelName}>{pkg.hotelDetails.makkah.name}</Text>
                <Text style={styles.hotelInfo}>
                  {'★'.repeat(pkg.hotelDetails.makkah.rating)} • {pkg.hotelDetails.makkah.distance}
                </Text>
              </View>
              <View style={styles.hotelCard}>
                <Text style={styles.hotelCity}>Madinah</Text>
                <Text style={styles.hotelName}>{pkg.hotelDetails.madinah.name}</Text>
                <Text style={styles.hotelInfo}>
                  {'★'.repeat(pkg.hotelDetails.madinah.rating)} • {pkg.hotelDetails.madinah.distance}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inclusions</Text>
            <View style={styles.listCard}>
              {pkg.inclusions.map((item: string, index: number) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {pkg.exclusions && pkg.exclusions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Exclusions</Text>
              <View style={styles.listCard}>
                {pkg.exclusions.map((item: string, index: number) => (
                  <View key={index} style={styles.listItem}>
                    <Text style={styles.crossmark}>✗</Text>
                    <Text style={styles.listText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        <View style={styles.footer}>
          <View>
            <Text style={styles.priceLabel}>Starting from</Text>
            <Text style={styles.price}>{formatPrice(pkg.price)}</Text>
          </View>
          <TouchableOpacity style={styles.bookButton} onPress={handleBookNow}>
            <Text style={styles.bookButtonText}>Book Now</Text>
          </TouchableOpacity>
        </View>
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
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      fontSize: 16,
      color: Colors.textSecondary,
    },
    content: {
      flex: 1,
    },
    header: {
      backgroundColor: Colors.card,
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    badges: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    typeBadge: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    featuredBadge: {
      backgroundColor: Colors.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    packageName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 8,
    },
    description: {
      fontSize: 16,
      color: Colors.textSecondary,
      lineHeight: 24,
    },
    section: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 12,
    },
    detailsCard: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 12,
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
    divider: {
      height: 1,
      backgroundColor: Colors.border,
    },
    hotelCard: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    hotelCity: {
      fontSize: 12,
      color: Colors.primary,
      fontWeight: '600',
      marginBottom: 4,
    },
    hotelName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 4,
    },
    hotelInfo: {
      fontSize: 14,
      color: Colors.textSecondary,
    },
    listCard: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    checkmark: {
      fontSize: 16,
      color: Colors.success,
      marginRight: 12,
      fontWeight: 'bold',
    },
    crossmark: {
      fontSize: 16,
      color: Colors.error,
      marginRight: 12,
      fontWeight: 'bold',
    },
    listText: {
      flex: 1,
      fontSize: 14,
      color: Colors.text,
      lineHeight: 20,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.card,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
    },
    priceLabel: {
      fontSize: 12,
      color: Colors.textSecondary,
      marginBottom: 4,
    },
    price: {
      fontSize: 24,
      fontWeight: 'bold',
      color: Colors.primary,
    },
    bookButton: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 14,
      borderRadius: 12,
    },
    bookButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
  