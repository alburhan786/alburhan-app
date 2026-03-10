import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from "react-native";
import { Ionicons, MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CONTACT_INFO = {
  phones: [
    { label: "Main Office", number: "+91 9893225590" },
    { label: "Booking Enquiry", number: "+91 9893989786" },
  ],
  whatsapp: "+919893989786",
  email: "info@alburhantravels.com",
  website: "www.alburhantravels.com",
  address: "8-5, Khanka Masjid Complex\nLalbagh Rd, Goti Maholla\nBurhanpur, Madhya Pradesh 450331",
  mapsUrl: "https://maps.google.com/?q=866J%2B34Q,Burhanpur,Madhya+Pradesh",
  officeHours: "Mon - Sat: 10:00 AM - 7:00 PM",
  social: {
    facebook: "https://facebook.com/alburhantours",
    instagram: "https://instagram.com/alburhantours",
    youtube: "https://youtube.com/@alburhantravels",
  },
};

function QuickActionButton({
  icon,
  iconSet,
  label,
  color,
  onPress,
}: {
  icon: string;
  iconSet: "ionicons" | "material" | "fontawesome";
  label: string;
  color: string;
  onPress: () => void;
}) {
  const IconComponent =
    iconSet === "material"
      ? MaterialIcons
      : iconSet === "fontawesome"
        ? FontAwesome5
        : Ionicons;

  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickActionIcon, { backgroundColor: color }]}>
        <IconComponent name={icon as any} size={24} color="#FFFFFF" />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ContactCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconContainer}>
          <Ionicons name={icon as any} size={20} color={Colors.primary} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function ContactScreen() {
  const insets = useSafeAreaInsets();

  const handleCall = (number: string) => {
    const cleaned = number.replace(/\s/g, "");
    Linking.openURL(`tel:${cleaned}`);
  };

  const handleWhatsApp = () => {
    Linking.openURL(
      `https://wa.me/919893989786?text=Assalamu%20Alaikum%20I%20want%20to%20register%20for%20Hajj%202027%20package%20with%20Al%20Burhan%20Tours%20and%20Travels`
    );
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${CONTACT_INFO.email}?subject=Package%20Enquiry`);
  };

  const handleSocial = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 },
        ]}
      >
        <Text style={styles.headerTitle}>Contact Us</Text>
        <Text style={styles.headerSubtitle}>We're here to help you</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 50 : 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quickActionsContainer}>
          <QuickActionButton
            icon="call"
            iconSet="ionicons"
            label="Call"
            color="#047857"
            onPress={() => handleCall(CONTACT_INFO.phones[0].number)}
          />
          <QuickActionButton
            icon="logo-whatsapp"
            iconSet="ionicons"
            label="WhatsApp"
            color="#25D366"
            onPress={handleWhatsApp}
          />
          <QuickActionButton
            icon="mail"
            iconSet="ionicons"
            label="Email"
            color="#D97706"
            onPress={handleEmail}
          />
        </View>

        <ContactCard icon="call-outline" title="Phone Numbers">
          {CONTACT_INFO.phones.map((phone, index) => (
            <TouchableOpacity
              key={index}
              style={styles.phoneRow}
              onPress={() => handleCall(phone.number)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.phoneLabel}>{phone.label}</Text>
                <Text style={styles.phoneNumber}>{phone.number}</Text>
              </View>
              <Ionicons name="call-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          ))}
        </ContactCard>

        <ContactCard icon="mail-outline" title="Email">
          <TouchableOpacity onPress={handleEmail} activeOpacity={0.7}>
            <Text style={styles.linkText}>{CONTACT_INFO.email}</Text>
          </TouchableOpacity>
        </ContactCard>

        <ContactCard icon="location-outline" title="Office Address">
          <Text style={styles.addressText}>{CONTACT_INFO.address}</Text>
          <View style={styles.officeHoursRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.officeHoursText}>{CONTACT_INFO.officeHours}</Text>
          </View>
        </ContactCard>

        <ContactCard icon="globe-outline" title="Follow Us">
          <View style={styles.socialRow}>
            <TouchableOpacity
              style={styles.socialButton}
              onPress={() => handleSocial(CONTACT_INFO.social.facebook)}
              activeOpacity={0.7}
            >
              <FontAwesome5 name="facebook" size={22} color="#1877F2" />
              <Text style={styles.socialLabel}>Facebook</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialButton}
              onPress={() => handleSocial(CONTACT_INFO.social.instagram)}
              activeOpacity={0.7}
            >
              <FontAwesome5 name="instagram" size={22} color="#E4405F" />
              <Text style={styles.socialLabel}>Instagram</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialButton}
              onPress={() => handleSocial(CONTACT_INFO.social.youtube)}
              activeOpacity={0.7}
            >
              <FontAwesome5 name="youtube" size={22} color="#FF0000" />
              <Text style={styles.socialLabel}>YouTube</Text>
            </TouchableOpacity>
          </View>
        </ContactCard>

        <TouchableOpacity
          style={styles.mapPlaceholder}
          onPress={() => Linking.openURL(CONTACT_INFO.mapsUrl)}
          activeOpacity={0.85}
        >
          <Ionicons name="location" size={48} color={Colors.primary} />
          <Text style={styles.mapPlaceholderText}>Al Burhan Tours & Travels</Text>
          <Text style={styles.mapSubText}>Khanka Masjid Complex, Burhanpur</Text>
          <View style={styles.directionsButton}>
            <Ionicons name="navigate-outline" size={16} color="#FFFFFF" />
            <Text style={styles.directionsButtonText}>Open in Google Maps</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  quickActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
    marginTop: 8,
  },
  quickAction: {
    alignItems: "center",
    gap: 8,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  cardIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold" as const,
    color: Colors.text,
  },
  phoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  phoneLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  phoneNumber: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.primary,
  },
  linkText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: "500" as const,
  },
  addressText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  officeHoursRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  officeHoursText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 4,
  },
  socialButton: {
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  socialLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  mapPlaceholder: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: "600" as const,
    marginTop: 4,
  },
  mapSubText: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
  },
  directionsButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600" as const,
  },
});
