import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/Colors';

const kitItems = [
  {
    name: '24" PP Bag',
    subtitle: 'Large luggage bag for your journey',
    icon: 'bag-suitcase',
    iconSet: 'mci',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    name: '20" PP Bag',
    subtitle: 'Cabin-sized carry-on bag',
    icon: 'bag-suitcase-outline',
    iconSet: 'mci',
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    name: 'Backpack',
    subtitle: 'Comfortable daypack for Ziyarat',
    icon: 'bag-personal',
    iconSet: 'mci',
    color: '#8B5CF6',
    bg: '#F5F3FF',
  },
  {
    name: 'Mina / Arafat Bag',
    subtitle: 'Lightweight bag for Hajj rituals',
    icon: 'shopping-bag',
    iconSet: 'fa5',
    color: '#EC4899',
    bg: '#FDF2F8',
  },
  {
    name: 'Passport Bag',
    subtitle: 'Secure neck pouch for documents',
    icon: 'passport',
    iconSet: 'fa5',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    name: 'Shoe Bag',
    subtitle: 'Carry bag for footwear at Haram',
    icon: 'shoe-formal',
    iconSet: 'mci',
    color: '#F97316',
    bg: '#FFF7ED',
  },
  {
    name: 'Umbrella',
    subtitle: 'Sun & rain protection',
    icon: 'umbrella',
    iconSet: 'ion',
    color: '#0EA5E9',
    bg: '#F0F9FF',
  },
  {
    name: 'Sunglasses',
    subtitle: 'UV protection eyewear',
    icon: 'glasses',
    iconSet: 'ion',
    color: '#14B8A6',
    bg: '#F0FDFA',
  },
  {
    name: 'Electric Neck Fan',
    subtitle: 'Portable cooling companion',
    icon: 'fan',
    iconSet: 'mci',
    color: '#06B6D4',
    bg: '#ECFEFF',
  },
  {
    name: 'Muzdalifah Sleeping Mat',
    subtitle: 'Comfortable mat for overnight stay',
    icon: 'bed-outline',
    iconSet: 'ion',
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    name: 'Janamaz (Prayer Mat)',
    subtitle: 'Personal prayer mat',
    icon: 'rug',
    iconSet: 'fa5',
    color: '#047857',
    bg: '#ECFDF5',
  },
  {
    name: 'Tasbeeh',
    subtitle: 'Prayer beads for Dhikr',
    icon: 'circle-double',
    iconSet: 'mci',
    color: '#D97706',
    bg: '#FFFBEB',
  },
  {
    name: 'Printed Hajj & Umrah Guide',
    subtitle: 'Step-by-step pilgrimage guidebook',
    icon: 'book',
    iconSet: 'ion',
    color: '#2563EB',
    bg: '#EFF6FF',
  },
  {
    name: 'Ihram Belt',
    subtitle: 'Secure belt for Ihram garment',
    icon: 'tie',
    iconSet: 'mci',
    color: '#9333EA',
    bg: '#FAF5FF',
  },
  {
    name: 'Ihram',
    subtitle: 'Sacred white garment for Hajj',
    icon: 'tshirt-crew',
    iconSet: 'mci',
    color: '#047857',
    bg: '#ECFDF5',
  },
];

function KitIcon({ item, size }: { item: typeof kitItems[0]; size: number }) {
  if (item.iconSet === 'mci') {
    return <MaterialCommunityIcons name={item.icon as any} size={size} color={item.color} />;
  }
  if (item.iconSet === 'fa5') {
    return <FontAwesome5 name={item.icon as any} size={size - 4} color={item.color} />;
  }
  return <Ionicons name={item.icon as any} size={size} color={item.color} />;
}

export default function TravelKitScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webTop = Platform.OS === 'web' ? 67 : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#047857', '#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroSection, { paddingTop: insets.top + webTop + 12 }]}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.heroBackBtn}>
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.heroIconContainer}>
            <View style={styles.heroIconCircle}>
              <MaterialCommunityIcons name="gift-outline" size={40} color="#047857" />
            </View>
          </View>
          <Text style={styles.heroTitle}>Complimentary Travel Kit</Text>
          <Text style={styles.heroSubtitle}>
            Burhan Budget Saver Shifting Package
          </Text>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>15 Premium Items Included FREE</Text>
          </View>
        </LinearGradient>

        <View style={styles.introCard}>
          <View style={styles.introIconRow}>
            <MaterialCommunityIcons name="star-circle" size={24} color="#D97706" />
            <Text style={styles.introTitle}>Your Journey Essentials</Text>
          </View>
          <Text style={styles.introText}>
            Every pilgrim on the Burhan Budget Saver Shifting package receives this
            complete travel kit at no extra cost. Carefully curated to make your
            40-day Hajj journey comfortable and hassle-free.
          </Text>
        </View>

        <View style={styles.gridContainer}>
          {kitItems.map((item, index) => (
            <View key={index} style={styles.gridItem}>
              <View style={[styles.itemCard, { borderLeftColor: item.color }]}>
                <View style={[styles.iconContainer, { backgroundColor: item.bg }]}>
                  <KitIcon item={item} size={28} />
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                </View>
                <View style={[styles.itemNumber, { backgroundColor: item.bg }]}>
                  <Text style={[styles.itemNumberText, { color: item.color }]}>{index + 1}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <LinearGradient
          colors={['#FFFBEB', '#FEF3C7']}
          style={styles.noteCard}
        >
          <View style={styles.noteHeader}>
            <Ionicons name="information-circle" size={22} color="#D97706" />
            <Text style={styles.noteTitle}>Package Highlights</Text>
          </View>
          <View style={styles.noteItem}>
            <Text style={styles.noteBullet}>●</Text>
            <Text style={styles.noteText}>40-day complete Hajj journey</Text>
          </View>
          <View style={styles.noteItem}>
            <Text style={styles.noteBullet}>●</Text>
            <Text style={styles.noteText}>Departure: 05 May 2027 | Return: 20 June 2027</Text>
          </View>
          <View style={styles.noteItem}>
            <Text style={styles.noteBullet}>●</Text>
            <Text style={styles.noteText}>Ziyarat: Makkah, Madinah, Taif & Badar</Text>
          </View>
          <View style={styles.noteItem}>
            <Text style={styles.noteBullet}>●</Text>
            <Text style={styles.noteText}>All 15 travel essentials provided complimentary</Text>
          </View>
        </LinearGradient>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Al Burhan Tours & Travels</Text>
          <Text style={styles.footerSubtext}>Your Trusted Partner for Hajj & Umrah</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  heroBackBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
    padding: 4,
  },
  heroIconContainer: {
    marginBottom: 16,
  },
  heroIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 16,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  introCard: {
    marginHorizontal: 16,
    marginTop: -16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  introIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#111827',
  },
  introText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  gridItem: {
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 3,
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 17,
  },
  itemNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  itemNumberText: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  noteCard: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#92400E',
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noteBullet: {
    fontSize: 8,
    color: '#D97706',
    marginRight: 10,
    marginTop: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#78350F',
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#047857',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 13,
    color: '#6B7280',
  },
});
