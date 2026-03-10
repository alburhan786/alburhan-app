import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Share,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { packageService, seedDatabase } from "@/services/api";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

const WHATSAPP_PHONE = "919893989786";

export default function BrochuresScreen() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const response = await packageService.getPackages();
      if (response.success && response.packages.length > 0) {
        setPackages(response.packages);
      } else {
        await seedDatabase();
        const retryResponse = await packageService.getPackages();
        if (retryResponse.success) {
          setPackages(retryResponse.packages);
        }
      }
    } catch (error) {
      console.error("Error loading packages:", error);
      Alert.alert("Error", "Could not load brochures");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: string) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(parseFloat(price));
  };

  const buildWhatsAppMessage = (pkg: any) => {
    const lines = [
      `*AL BURHAN Tours & Travels*`,
      ``,
      `*${pkg.name}*`,
      pkg.category ? `${pkg.category}` : "",
      ``,
      `${pkg.description}`,
      ``,
      `*Package Details:*`,
      `Duration: ${pkg.duration}`,
      `Departure: ${new Date(pkg.departureDate).toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}`,
      `Price: ${formatPrice(pkg.price)} per person`,
      ``,
    ];

    if (pkg.hotels && pkg.hotels.length > 0) {
      lines.push(`*Hotels:*`);
      pkg.hotels.forEach((hotel: any) => {
        lines.push(`- ${hotel.name} (${hotel.city}) ${"★".repeat(hotel.starRating || 0)}`);
      });
      lines.push(``);
    }

    if (pkg.inclusions && pkg.inclusions.length > 0) {
      lines.push(`*Inclusions:*`);
      pkg.inclusions.forEach((item: string) => {
        lines.push(`- ${item}`);
      });
      lines.push(``);
    }

    lines.push(`For booking & enquiry:`);
    lines.push(`Call/WhatsApp: +91 98939 89786`);

    return lines.filter((l) => l !== undefined).join("\n");
  };

  const shareOnWhatsApp = (pkg: any) => {
    const message = buildWhatsAppMessage(pkg);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/?text=${encoded}`;
    Linking.openURL(url);
  };

  const shareNative = async (pkg: any) => {
    const message = buildWhatsAppMessage(pkg);
    try {
      await Share.share({ message });
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const umrahPackages = packages.filter((p) => p.type === "umrah");
  const hajjPackages = packages.filter((p) => p.type === "hajj");

  const renderBrochureCard = (pkg: any) => (
    <View key={pkg.id} style={styles.brochureCard}>
      <View style={styles.cardTopBar}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: pkg.type === "hajj" ? Colors.primary : "#2563eb" },
          ]}
        >
          <Text style={styles.typeBadgeText}>
            {pkg.type === "hajj" ? "HAJJ" : "UMRAH"}
          </Text>
        </View>
        {pkg.featured && (
          <View style={styles.featuredTag}>
            <Ionicons name="star" size={12} color={Colors.secondary} />
            <Text style={styles.featuredTagText}>Featured</Text>
          </View>
        )}
      </View>

      <Text style={styles.brochureTitle}>{pkg.name}</Text>
      {pkg.category && (
        <Text style={styles.brochureCategory}>{pkg.category}</Text>
      )}

      <Text style={styles.brochureDesc} numberOfLines={3}>
        {pkg.description}
      </Text>

      <View style={styles.infoGrid}>
        <View style={styles.infoItem}>
          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>{pkg.duration}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="airplane-outline" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            {new Date(pkg.departureDate).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
      </View>

      {pkg.hotels && pkg.hotels.length > 0 && (
        <View style={styles.hotelsPreview}>
          <Text style={styles.hotelsLabel}>Hotels</Text>
          {pkg.hotels.slice(0, 2).map((hotel: any, idx: number) => (
            <View key={idx} style={styles.hotelRow}>
              <Ionicons name="business-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.hotelText} numberOfLines={1}>
                {hotel.name} ({hotel.city})
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.priceRow}>
        <View>
          <Text style={styles.priceLabel}>Starting from</Text>
          <Text style={styles.priceValue}>{formatPrice(pkg.price)}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.push(`/package/${pkg.id}`)}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
          <Text style={styles.viewBtnText}>View Details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.whatsappBtn}
          onPress={() => shareOnWhatsApp(pkg)}
          activeOpacity={0.7}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
          <Text style={styles.whatsappBtnText}>WhatsApp</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => shareNative(pkg)}
          activeOpacity={0.7}
        >
          <Ionicons name="share-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 },
        ]}
      >
        <MaterialCommunityIcons name="file-document-multiple-outline" size={24} color="#FFFFFF" />
        <Text style={styles.headerTitle}>Brochures</Text>
        <Text style={styles.headerSubtitle}>
          {packages.length} package{packages.length !== 1 ? "s" : ""} available
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {umrahPackages.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionBadge, { backgroundColor: "#2563eb" }]}>
                <Text style={styles.sectionBadgeText}>UMRAH 2026</Text>
              </View>
              <Text style={styles.sectionCount}>
                {umrahPackages.length} brochure{umrahPackages.length !== 1 ? "s" : ""}
              </Text>
            </View>
            {umrahPackages.map(renderBrochureCard)}
          </View>
        )}

        {hajjPackages.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>HAJJ 2027</Text>
              </View>
              <Text style={styles.sectionCount}>
                {hajjPackages.length} brochure{hajjPackages.length !== 1 ? "s" : ""}
              </Text>
            </View>
            {hajjPackages.map(renderBrochureCard)}
          </View>
        )}

        {packages.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={48}
              color={Colors.textSecondary}
            />
            <Text style={styles.emptyText}>No brochures available</Text>
          </View>
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
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold" as const,
    color: "#FFFFFF",
    marginTop: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sectionBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold" as const,
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  brochureCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold" as const,
    letterSpacing: 0.5,
  },
  featuredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  featuredTagText: {
    fontSize: 12,
    color: Colors.secondary,
    fontWeight: "600" as const,
  },
  brochureTitle: {
    fontSize: 17,
    fontWeight: "bold" as const,
    color: Colors.text,
    marginBottom: 2,
  },
  brochureCategory: {
    fontSize: 12,
    color: "#6366f1",
    fontWeight: "600" as const,
    marginBottom: 6,
  },
  brochureDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 12,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "500" as const,
  },
  hotelsPreview: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  hotelsLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  hotelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  hotelText: {
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  priceRow: {
    marginBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  priceLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: "bold" as const,
    color: Colors.primary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  viewBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.primary,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#25D366",
  },
  whatsappBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#FFFFFF",
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
