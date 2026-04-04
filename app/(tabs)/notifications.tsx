import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { notificationService } from '../../services/api';
import { Colors } from '../../constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { queryClient } from '@/lib/query-client';
import { NOTIFS_VIEWED_AT_KEY, NOTIFS_VIEWED_QUERY_KEY } from '@/constants/notificationBadge';

interface Notification {
  id: number;
  userId: number;
  bookingId?: number;
  title?: string;
  type: string;
  channel: string;
  message: string;
  status: string;
  sentAt: string;
  metadata?: any;
}

function getTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'multi_channel':
    case 'booking': return Colors.primary;
    case 'payment': return '#059669';
    case 'broadcast': return '#7c3aed';
    case 'single': return '#2563eb';
    case 'otp': return '#d97706';
    default: return Colors.textSecondary;
  }
}

function getTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type.toLowerCase()) {
    case 'multi_channel':
    case 'booking': return 'calendar-outline';
    case 'payment': return 'checkmark-circle-outline';
    case 'broadcast': return 'megaphone-outline';
    case 'otp': return 'key-outline';
    default: return 'notifications-outline';
  }
}

function getTypeLabel(type: string): string {
  switch (type.toLowerCase()) {
    case 'multi_channel': return 'Booking';
    case 'booking': return 'Booking';
    case 'payment': return 'Payment';
    case 'broadcast': return 'Announcement';
    case 'single': return 'Message';
    case 'otp': return 'OTP';
    case 'reminder': return 'Reminder';
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'sent': return '#059669';
    case 'failed': return '#dc2626';
    case 'pending': return '#d97706';
    default: return Colors.textSecondary;
  }
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NotificationsScreen() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    if (!user) return;
    const now = new Date().toISOString();
    const storageKey = NOTIFS_VIEWED_AT_KEY(user.id);
    const queryKey = NOTIFS_VIEWED_QUERY_KEY(user.id);
    queryClient.setQueryData(queryKey, now);
    AsyncStorage.setItem(storageKey, now).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    loadNotifications();
  }, [user]));

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      loadNotifications();
    } else {
      setLoading(false);
    }
  }, [user, authLoading]);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const response = await notificationService.getUserNotifications();
      if (response.success) {
        setNotifs(response.notifications || []);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleCardPress = (notif: Notification) => {
    if (notif.bookingId) {
      router.push({ pathname: '/booking/[id]', params: { id: String(notif.bookingId) } } as Href);
    } else {
      router.push('/(tabs)/bookings' as Href);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="notifications-off-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyStateTitle}>Login Required</Text>
          <Text style={styles.emptyStateText}>Please login to view your notifications</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 67 : insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifs.length > 0 && (
          <Text style={styles.headerCount}>{notifs.length} notification{notifs.length !== 1 ? 's' : ''}</Text>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        {notifs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={52} color={Colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No notifications yet</Text>
            <Text style={styles.emptyStateText}>
              Your booking and payment updates will appear here
            </Text>
          </View>
        ) : (
          notifs.map((notif) => {
            const imageUrl: string | undefined = notif.metadata?.imageUrl;
            const typeColor = getTypeColor(notif.type);

            return (
              <TouchableOpacity
                key={notif.id}
                style={[styles.card, styles.cardClickable]}
                onPress={() => handleCardPress(notif)}
                activeOpacity={0.75}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconBadge, { backgroundColor: typeColor + '18' }]}>
                    <Ionicons name={getTypeIcon(notif.type)} size={20} color={typeColor} />
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={styles.metaRow}>
                      <Text style={[styles.typeLabel, { color: typeColor }]}>{getTypeLabel(notif.type)}</Text>
                      {notif.bookingId ? (
                        <Text style={styles.bookingRef}>· Booking #{notif.bookingId}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.timestamp}>{formatDateTime(notif.sentAt)}</Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(notif.status) }]} />
                </View>

                {notif.title ? (
                  <Text style={styles.title} numberOfLines={2}>{notif.title}</Text>
                ) : null}

                <View style={styles.bodyRow}>
                  <Text style={styles.message} numberOfLines={imageUrl ? 3 : 5}>{notif.message}</Text>
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>

                <View style={styles.viewBookingRow}>
                  <Text style={[styles.viewBookingText, { color: typeColor }]}>
                    {notif.bookingId ? 'View Booking' : 'View All Bookings'}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={typeColor} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: Platform.OS === 'web' ? 34 : insets.bottom + 16 }} />
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
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
    marginTop: 60,
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  emptyStateText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  cardClickable: {
    borderColor: Colors.primary + '22',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bookingRef: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 22,
  },
  bodyRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  message: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: Colors.background,
  },
  viewBookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewBookingText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
