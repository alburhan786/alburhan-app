import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { packageService } from "@/services/api";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HotelInfo {
  name: string;
  rating: number;
  distance: string;
  packageName: string;
  packageType: string;
}

export default function HotelsScreen() {
  const [makkahHotels, setMakkahHotels] = useState<HotelInfo[]>([]);
  const [madinahHotels, setMadinahHotels] = useState<HotelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadHotels();
  }, []);

  const loadHotels = async () => {
    try {
      const response = await packageService.getPackages();
      if (response.success && response.packages) {
        const makkah: HotelInfo[] = [];
        const madinah: HotelInfo[] = [];
        const seenMakkah = new Set<string>();
        const seenMadinah = new Set<string>();

        for (const pkg of response.packages) {
          try {
            if (pkg.hotelDetails) {
              const details = typeof pkg.hotelDetails === "string"
                ? JSON.parse(pkg.hotelDetails)
                : pkg.hotelDetails;

              if (details.makkah && !seenMakkah.has(details.makkah.name)) {
                seenMakkah.add(details.makkah.name);
                makkah.push({
                  ...details.makkah,
                  packageName: pkg.name,
                  packageType: pkg.type,
                });
              }
              if (details.madinah && !seenMadinah.has(details.madinah.name)) {
                seenMadinah.add(details.madinah.name);
                madinah.push({
                  ...details.madinah,
                  packageName: pkg.name,
                  packageType: pkg.type,
                });
              }
            }
          } catch (e) {
            console.warn("Skipping malformed hotelDetails for package:", pkg.name);
          }
        }

        setMakkahHotels(makkah);
        setMadinahHotels(madinah);
      }
    } catch (error) {
      console.error("Error loading hotels:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i < rating ? "star" : "star-outline"}
          size={16}
          color={i < rating ? Colors.secondary : Colors.border}
        />
      );
    }
    return stars;
  };

  const renderHotelCard = (hotel: HotelInfo, index: number) => (
    <View key={`${hotel.name}-${index}`} style={styles.hotelCard}>
      <View style={styles.hotelIconContainer}>
        <MaterialCommunityIcons name="office-building" size={32} color={Colors.primary} />
      </View>
      <View style={styles.hotelInfo}>
        <Text style={styles.hotelName}>{hotel.name}</Text>
        <View style={styles.starsRow}>{renderStars(hotel.rating)}</View>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.distanceText}>{hotel.distance}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="pricetag-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.packageRefText}>{hotel.packageName}</Text>
        </View>
      </View>
      <View style={[styles.typeBadge, { backgroundColor: hotel.packageType === "hajj" ? Colors.primary : "#2563eb" }]}>
        <Text style={styles.typeBadgeText}>{hotel.packageType === "hajj" ? "Hajj" : "Umrah"}</Text>
      </View>
    </View>
  );

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
        <Text style={styles.headerTitle}>Hotels</Text>
        <Text style={styles.headerSubtitle}>Accommodations in the Holy Cities</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.citySection}>
          <View style={styles.cityHeader}>
            <MaterialCommunityIcons name="mosque" size={24} color={Colors.primary} />
            <Text style={styles.cityTitle}>Makkah</Text>
          </View>
          <Text style={styles.cityLandmark}>Near Masjid al-Haram</Text>
          {makkahHotels.length > 0 ? (
            makkahHotels.map(renderHotelCard)
          ) : (
            <Text style={styles.emptyText}>No hotel information available</Text>
          )}
        </View>

        <View style={styles.citySection}>
          <View style={styles.cityHeader}>
            <MaterialCommunityIcons name="mosque" size={24} color="#2563eb" />
            <Text style={[styles.cityTitle, { color: "#2563eb" }]}>Madinah</Text>
          </View>
          <Text style={styles.cityLandmark}>Near Masjid an-Nabawi</Text>
          {madinahHotels.length > 0 ? (
            madinahHotels.map(renderHotelCard)
          ) : (
            <Text style={styles.emptyText}>No hotel information available</Text>
          )}
        </View>
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
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold" as const,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 20,
  },
  citySection: {
    marginBottom: 28,
  },
  cityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  cityTitle: {
    fontSize: 20,
    fontWeight: "bold" as const,
    color: Colors.primary,
  },
  cityLandmark: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
    marginLeft: 34,
  },
  hotelCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  hotelIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  hotelInfo: {
    flex: 1,
  },
  hotelName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 4,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  distanceText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  packageRefText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic" as const,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    position: "absolute" as const,
    top: 12,
    right: 12,
  },
  typeBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold" as const,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    padding: 20,
  },
});
