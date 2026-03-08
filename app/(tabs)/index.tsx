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
} from "react-native";
import { useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import { packageService, seedDatabase } from "@/services/api";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
    const [packages, setPackages] = useState<any[]>([]);
    const [filteredPackages, setFilteredPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
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

    const loadPackages = async () => {
      try {
        // First try to seed the database
        await seedDatabase();
        
        const response = await packageService.getPackages();
        if (response.success) {
          setPackages(response.packages);
        }
      } catch (error) {
        console.error('Error loading packages:', error);
        Alert.alert('Error', 'Could not load packages');
      } finally {
        setLoading(false);
      }
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
          <Text style={styles.headerTitle}>AL BURHAN</Text>
          <Text style={styles.headerSubtitle}>Tours & Travels</Text>
        </View>

        <ScrollView style={styles.content}>
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
                <View style={styles.packageHeader}>
                  {pkg.featured && (
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredText}>★ Featured</Text>
                    </View>
                  )}
                </View>

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
              </TouchableOpacity>
            );

            return (
              <View style={styles.packagesSection}>
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
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: '#FFFFFF',
      letterSpacing: 1,
    },
    headerSubtitle: {
      fontSize: 14,
      color: Colors.secondary,
      marginTop: 4,
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
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
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
  });
  