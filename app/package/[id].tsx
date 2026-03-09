import React, { useState, useEffect } from 'react';
  import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Linking,
    Share,
  } from 'react-native';
  import { useLocalSearchParams, useRouter } from 'expo-router';
  import { LinearGradient } from 'expo-linear-gradient';
  import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
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

    const generateWhatsAppMessage = () => {
      if (!pkg) return '';
      const lines = [
        `*${pkg.name}*`,
        pkg.category ? `_${pkg.category}_` : '',
        '',
        `*Al Burhan Tours & Travels*`,
        '',
        `Duration: ${pkg.duration}`,
        `Departure: ${formatDate(pkg.departureDate)}`,
        `Return: ${formatDate(pkg.returnDate)}`,
        '',
        `*Starting from: ${formatPrice(pkg.price)}*`,
        '',
      ];
      if (pkg.hotelDetails) {
        lines.push('*Hotels:*');
        lines.push(`Makkah: ${pkg.hotelDetails.makkah.name} (${pkg.hotelDetails.makkah.distance})`);
        lines.push(`Madinah: ${pkg.hotelDetails.madinah.name} (${pkg.hotelDetails.madinah.distance})`);
        lines.push('');
      }
      if (pkg.inclusions?.length) {
        lines.push('*Inclusions:*');
        pkg.inclusions.slice(0, 6).forEach((item: string) => lines.push(`✓ ${item}`));
        if (pkg.inclusions.length > 6) lines.push(`... and ${pkg.inclusions.length - 6} more`);
        lines.push('');
      }
      lines.push('_All packages exclude 5% GST_');
      lines.push('');
      lines.push('For booking & enquiry:');
      lines.push('📞 +91 98939 89786');
      lines.push('🌐 Al Burhan Tours & Travels');
      return lines.filter(l => l !== undefined).join('\n');
    };

    const handleShareWhatsApp = async () => {
      try {
        const message = generateWhatsAppMessage();
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
        } else {
          Alert.alert('WhatsApp Not Available', 'WhatsApp is not installed on this device. Use the share button to send via other apps.');
        }
      } catch (error) {
        Alert.alert('Error', 'Could not open WhatsApp. Please try the share button instead.');
      }
    };

    const handleShare = async () => {
      const message = generateWhatsAppMessage();
      try {
        await Share.share({ message });
      } catch (error) {
        console.error('Share error:', error);
      }
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

          {pkg.type === 'hajj' && (
            <View style={styles.section}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/travel-kit')}
              >
                <LinearGradient
                  colors={['#047857', '#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.travelKitBanner}
                >
                  <View style={styles.travelKitIcon}>
                    <MaterialCommunityIcons name="gift-outline" size={28} color="#047857" />
                  </View>
                  <View style={styles.travelKitInfo}>
                    <Text style={styles.travelKitTitle}>Complimentary Travel Kit</Text>
                    <Text style={styles.travelKitSubtitle}>15 premium items included FREE</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.8)" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Share Package</Text>
            <View style={styles.shareRow}>
              <TouchableOpacity style={styles.whatsappShareBtn} onPress={handleShareWhatsApp}>
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                <Text style={styles.whatsappShareText}>Send on WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

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
    shareRow: {
      flexDirection: 'row',
      gap: 12,
    },
    whatsappShareBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#25D366',
      paddingVertical: 14,
      borderRadius: 12,
      shadowColor: '#25D366',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    whatsappShareText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700' as const,
    },
    shareBtn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    travelKitBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 16,
      shadowColor: '#047857',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    travelKitIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    travelKitInfo: {
      flex: 1,
    },
    travelKitTitle: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: '#FFFFFF',
      marginBottom: 2,
    },
    travelKitSubtitle: {
      fontSize: 13,
      color: 'rgba(255,255,255,0.8)',
    },
  });
  