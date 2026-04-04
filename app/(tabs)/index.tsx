import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Image,
  RefreshControl,
} from "react-native";

import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { packageService, seedDatabase } from "@/services/api";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WHATSAPP_BUSINESS_LINK = 'https://wa.me/918989701701?text=Assalamu%20Alaikum%20I%20want%20to%20register%20for%20Hajj%202027%20package%20with%20Al%20Burhan%20Tours%20and%20Travels';

interface PkgImg { url: string; isMain?: boolean; position?: 'left' | 'center' | 'right' }
type PkgImgRaw = PkgImg | string;

// Extend React Native's style types to include web-only CSS properties
declare module 'react-native' {
  interface ImageStyle {
    objectPosition?: string;
  }
  interface ViewStyle {
    boxShadow?: string;
  }
}

function normalizePkgImgs(rawUrls?: PkgImgRaw[], fallbackUrl?: string): PkgImg[] {
  const arr: PkgImgRaw[] = Array.isArray(rawUrls) && rawUrls.length > 0
    ? rawUrls
    : (fallbackUrl ? [fallbackUrl] : []);
  return arr.map((item: PkgImgRaw) =>
    typeof item === 'string' ? { url: item, isMain: false, position: 'center' as const } : item
  );
}

function PackageImageWithFallback({ imageUrls, imageUrl, label, featured }: { imageUrls?: PkgImgRaw[]; imageUrl?: string; label: string; featured?: boolean; pkgId?: number }) {
  const imgs = normalizePkgImgs(imageUrls, imageUrl);
  const mainImg = imgs.find(i => i.isMain) || imgs[0];
  const primaryUrl = mainImg?.url || '';
  const position = (mainImg?.position || 'center') as 'left' | 'center' | 'right';
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!primaryUrl || failed) {
    return (
      <View style={{ width: '100%', height: 180, backgroundColor: '#047857', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</Text>
        {featured && (
          <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#d97706', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>★ Featured</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ width: '100%', height: 180, borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' }}>
      <Image
        source={{ uri: primaryUrl }}
        style={[{ width: '100%', height: 180 }, Platform.OS === 'web' ? { objectFit: 'cover', objectPosition: position } : {}]}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color="#047857" />
        </View>
      )}
      {featured && (
        <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#d97706', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>★ Featured</Text>
        </View>
      )}
      {imgs.length > 1 && (
        <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>📷 {imgs.length}</Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
    const [packages, setPackages] = useState<any[]>([]);
    const [filteredPackages, setFilteredPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filterType, setFilterType] = useState("all");
    const [minPrice, setMinPrice] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const router = useRouter();
    const insets = useSafeAreaInsets();

    useEffect(() => {
      loadPackages();
    }, []);

    useEffect(() => {
      applyFilters();
    }, [packages, filterType, minPrice, maxPrice, searchQuery]);

    const loadPackages = async (isRefresh = false) => {
      try {
        const response = await packageService.getPackages();
        if (response.success && response.packages.length > 0) {
          setPackages(response.packages);
        } else if (!isRefresh) {
          await seedDatabase();
          const retryResponse = await packageService.getPackages();
          if (retryResponse.success) {
            setPackages(retryResponse.packages);
          }
        }
      } catch (error) {
        console.error('Error loading packages:', error);
        if (!isRefresh) Alert.alert('Error', 'Could not load packages');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    const onRefresh = () => {
      setRefreshing(true);
      loadPackages(true);
    };

    const applyFilters = () => {
      let filtered = [...packages];

      if (filterType !== 'all') {
        filtered = filtered.filter(pkg => pkg.type === filterType);
      }

      if (minPrice) {
        filtered = filtered.filter(pkg => parseFloat(pkg.price) >= parseFloat(minPrice));
      }

      if (maxPrice) {
        filtered = filtered.filter(pkg => parseFloat(pkg.price) <= parseFloat(maxPrice));
      }

      if (searchQuery) {
        filtered = filtered.filter(pkg =>
          pkg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pkg.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      setFilteredPackages(filtered);
    };

    const formatPrice = (price: string) => {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(parseFloat(price));
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
        <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 }]}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }} />
            <View style={styles.headerCenter}>
              <Image
                source={require('@/assets/images/alburhan_logo.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/bookings')} style={styles.headerBtn}>
                <Ionicons name="document-text-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.headerBtn}>
                <Ionicons name="person-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#047857']}
              tintColor="#047857"
            />
          }
        >
          <View style={styles.searchSection}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search packages..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={Colors.textSecondary}
            />
          </View>

          <View style={styles.filterSection}>
            <View style={styles.filterRow}>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Type</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={filterType}
                    onValueChange={setFilterType}
                    style={styles.picker}
                  >
                    <Picker.Item label="All Packages" value="all" />
                    <Picker.Item label="Hajj 2027" value="hajj" />
                    <Picker.Item label="Umrah 2026" value="umrah" />
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.filterRow}>
              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Min Price (₹)</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="0"
                  value={minPrice}
                  onChangeText={setMinPrice}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>

              <View style={styles.filterItem}>
                <Text style={styles.filterLabel}>Max Price (₹)</Text>
                <TextInput
                  style={styles.filterInput}
                  placeholder="1000000"
                  value={maxPrice}
                  onChangeText={setMaxPrice}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>
          </View>

          {(() => {
            const hajjPackages = filteredPackages.filter(p => p.type === 'hajj');
            const umrahPackages = filteredPackages.filter(p => p.type === 'umrah');

            const renderCard = (pkg: any) => (
              <TouchableOpacity
                key={pkg.id}
                style={styles.packageCard}
                onPress={() => router.push(`/package/${pkg.id}`)}
              >
                <View style={styles.packageCardInner}>
                {(pkg.imageUrls?.length > 0 || pkg.imageUrl) ? (
                  <PackageImageWithFallback
                    imageUrls={pkg.imageUrls}
                    imageUrl={pkg.imageUrl}
                    label={pkg.type}
                    featured={pkg.featured}
                    pkgId={pkg.id}
                  />
                ) : (
                  pkg.featured && (
                    <View style={styles.packageHeader}>
                      <View style={styles.featuredBadge}>
                        <Text style={styles.featuredText}>★ Featured</Text>
                      </View>
                    </View>
                  )
                )}

                <View style={styles.packageTextContent}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                {pkg.category && (
                  <Text style={styles.categoryText}>{pkg.category}</Text>
                )}
                <Text style={styles.packageDescription} numberOfLines={2}>
                  {pkg.description}
                </Text>

                <View style={styles.packageDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>{pkg.duration}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Departure</Text>
                    <Text style={styles.detailValue}>{new Date(pkg.departureDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                </View>

                <View style={styles.packageFooter}>
                  <View>
                    <Text style={styles.priceLabel}>Starting from</Text>
                    <Text style={styles.price}>{formatPrice(pkg.price)}</Text>
                  </View>
                  <View style={styles.viewButton}>
                    <Text style={styles.viewButtonText}>View Details →</Text>
                  </View>
                </View>
                </View>
                </View>
              </TouchableOpacity>
            );

            return (
              <View style={styles.packagesSection}>
                {(filterType === 'all' || filterType === 'umrah') && umrahPackages.length > 0 && (
                  <View>
                    <View style={styles.groupHeader}>
                      <View style={[styles.groupBadge, { backgroundColor: '#2563eb' }]}>
                        <Text style={styles.groupBadgeText}>UMRAH 2026</Text>
                      </View>
                      <Text style={styles.groupSubtitle}>Umrah Packages</Text>
                      <Text style={styles.groupInfo}>{umrahPackages.length} package{umrahPackages.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {umrahPackages.map(renderCard)}
                  </View>
                )}

                {(filterType === 'all' || filterType === 'hajj') && hajjPackages.length > 0 && (
                  <View>
                    <View style={styles.groupHeader}>
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>HAJJ 2027</Text>
                      </View>
                      <Text style={styles.groupSubtitle}>Al Burhan Hajj Premium Collection</Text>
                      <Text style={styles.groupInfo}>{hajjPackages.length} package{hajjPackages.length !== 1 ? 's' : ''} • Departure: May 2027</Text>
                    </View>
                    {hajjPackages.map(renderCard)}
                  </View>
                )}

                {filteredPackages.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      No packages found matching your filters
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
        </ScrollView>

        <TouchableOpacity
          style={[styles.whatsappFab, { bottom: Platform.OS === 'web' ? 50 : 20 }]}
          onPress={() => Linking.openURL(WHATSAPP_BUSINESS_LINK)}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-whatsapp" size={28} color="#FFFFFF" />
        </TouchableOpacity>
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
      paddingBottom: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerCenter: {
      flex: 2,
      alignItems: 'center',
    },
    headerActions: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    headerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    headerLogo: {
      width: 120,
      height: 48,
    },
    content: {
      flex: 1,
    },
    searchSection: {
      padding: 16,
    },
    searchInput: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: Colors.text,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    filterSection: {
      padding: 16,
      paddingTop: 0,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    filterItem: {
      flex: 1,
    },
    filterLabel: {
      fontSize: 12,
      color: Colors.textSecondary,
      marginBottom: 8,
      fontWeight: '600',
    },
    pickerContainer: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
    },
    picker: {
      height: 50,
    },
    filterInput: {
      backgroundColor: Colors.card,
      borderRadius: 12,
      padding: 12,
      fontSize: 16,
      color: Colors.text,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    packagesSection: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 16,
    },
    groupHeader: {
      marginBottom: 16,
      marginTop: 8,
      padding: 16,
      backgroundColor: Colors.card,
      borderRadius: 16,
      borderLeftWidth: 4,
      borderLeftColor: Colors.primary,
    },
    groupBadge: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      alignSelf: 'flex-start',
      marginBottom: 8,
    },
    groupBadgeText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold' as const,
      letterSpacing: 1.5,
    },
    groupSubtitle: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: Colors.text,
      marginBottom: 4,
    },
    groupInfo: {
      fontSize: 13,
      color: Colors.textSecondary,
    },
    packageCard: {
      backgroundColor: Colors.card,
      borderRadius: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 6,
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.15)' } : {}),
    },
    packageCardInner: {
      borderRadius: 16,
      overflow: 'hidden',
    },
    packageImageContainer: {
      position: 'relative',
      width: '100%',
      height: 180,
    },
    packageImage: {
      width: '100%',
      height: 180,
    },
    featuredBadgeOverlay: {
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: Colors.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    packageTextContent: {
      padding: 16,
    },
    packageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    packageBadge: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    packageBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    featuredBadge: {
      backgroundColor: Colors.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    featuredText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: 'bold',
    },
    packageName: {
      fontSize: 18,
      fontWeight: 'bold',
      color: Colors.text,
      marginBottom: 4,
    },
    categoryText: {
      fontSize: 13,
      color: '#6366f1',
      fontWeight: '600' as const,
      marginBottom: 8,
    },
    packageDescription: {
      fontSize: 14,
      color: Colors.textSecondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    packageDetails: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    detailItem: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 12,
      color: Colors.textSecondary,
      marginBottom: 4,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: Colors.text,
    },
    packageFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    viewButton: {
      backgroundColor: Colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 8,
    },
    viewButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: 'bold',
    },
    emptyState: {
      padding: 40,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: 16,
      color: Colors.textSecondary,
      textAlign: 'center',
    },
    whatsappFab: {
      position: 'absolute' as const,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#25D366',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 8,
    },
  });
  