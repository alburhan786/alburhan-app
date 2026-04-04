import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { fetch } from 'expo/fetch';
import { getApiUrl } from '@/lib/query-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data as string;
    console.log(`[Push] getDevicePushTokenAsync OK: ${token.slice(0, 20)}...`);
    return token;
  } catch (err: any) {
    console.warn('[Push] getDevicePushTokenAsync failed:', err?.message ?? err);
    return null;
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      '31cc1af8-5403-4f51-82a3-8730763a7dbc';
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log(`[Push] getExpoPushTokenAsync OK: ${tokenData.data}`);
    return tokenData.data;
  } catch (err: any) {
    console.warn('[Push] getExpoPushTokenAsync failed:', err?.message ?? err);
    return null;
  }
}

async function getStoredAuth(): Promise<{ userId?: number; userToken?: string }> {
  try {
    const userStr = await AsyncStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      return {
        userId: parsed?.id ? Number(parsed.id) : undefined,
        userToken: parsed?.userToken ? String(parsed.userToken) : undefined,
      };
    }
  } catch (_) {}
  return {};
}

let _registrationInProgress = false;

export function resetRegistration(): void {
  _registrationInProgress = false;
}

export interface TokenRegistrationResult {
  success: boolean;
  fcmToken: string | null;
  expoPushToken: string | null;
  error?: string;
}

export async function registerDeviceToken(silent = false): Promise<TokenRegistrationResult> {
  if (_registrationInProgress) {
    return { success: false, fcmToken: null, expoPushToken: null, error: 'Registration already in progress' };
  }
  _registrationInProgress = true;
  try {
    const granted = await requestNotificationPermission();
    if (!granted) {
      const msg = 'Notification permission denied. Go to Settings → Apps → Al Burhan → Notifications and enable them.';
      console.warn('[Push] Notification permission not granted — skipping token registration');
      if (!silent) Alert.alert('Notifications Blocked', msg);
      return { success: false, fcmToken: null, expoPushToken: null, error: msg };
    }

    const auth = await getStoredAuth();
    const { userId, userToken } = auth;
    const platform = Platform.OS;

    console.log(`[Push] Registering device token — userId=${userId ?? 'none'} platform=${platform}`);

    // Get both token types in parallel
    const [expoPushToken, fcmToken] = await Promise.all([
      getExpoPushToken(),
      getFcmToken(),
    ]);

    // Raw FCM token (non-Expo format) — used as fallback for direct FCM delivery
    const realFcmToken = (fcmToken && !fcmToken.startsWith('ExponentPushToken')) ? fcmToken : null;

    if (!expoPushToken && !realFcmToken) {
      const msg = 'Could not obtain a push notification token. Check internet access and try again.';
      console.warn('[Push] No valid token obtained — nothing registered');
      if (!silent) Alert.alert('Notification Setup Failed', msg);
      return { success: false, fcmToken: null, expoPushToken: null, error: msg };
    }

    // Build request body — always include expoPushToken when available
    const body: Record<string, any> = { platform };
    if (expoPushToken) body.expoPushToken = expoPushToken;
    if (realFcmToken) body.token = realFcmToken;
    // Include auth in body as fallback (works even if session cookie or headers fail)
    if (userId && userToken) {
      body.userId = userId;
      body.userToken = userToken;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId && userToken) {
      headers['X-User-Id'] = String(userId);
      headers['X-User-Token'] = userToken;
    }

    const resp = await fetch(new URL('/api/user/device-token', getApiUrl()).toString(), {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const respBody = await resp.text().catch(() => '');
      console.warn(`[Push] Token registration failed (${resp.status}): ${respBody}`);
      if (!silent) {
        Alert.alert('Notification Setup Failed', `Could not register push token (${resp.status}). Please try again.`);
      }
      return { success: false, fcmToken: realFcmToken, expoPushToken: expoPushToken ?? null, error: `HTTP ${resp.status}` };
    }

    console.log(`[Push] ✓ Token registered — userId=${userId} expo=${expoPushToken ?? 'none'} fcm=${realFcmToken ? realFcmToken.slice(0, 20) + '...' : 'none'}`);
    return { success: true, fcmToken: realFcmToken, expoPushToken: expoPushToken ?? null };

  } catch (err: any) {
    const msg = `Notification setup error: ${err?.message ?? 'Unknown error'}`;
    console.warn('[Push] registerDeviceToken failed:', msg);
    if (!silent) Alert.alert('Notification Setup Failed', msg);
    return { success: false, fcmToken: null, expoPushToken: null, error: msg };
  } finally {
    _registrationInProgress = false;
  }
}

export async function unregisterDeviceToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const fcmToken = await getFcmToken();
    if (!fcmToken) return;
    await fetch(new URL('/api/user/device-token', getApiUrl()).toString(), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: fcmToken }),
    });
  } catch (err: any) {
    console.warn('[Push] unregisterDeviceToken failed:', err?.message ?? err);
  }
}

export const PUSH_CHANNEL_ID = 'alburhan-push';

export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
      name: 'Al Burhan Notifications',
      description: 'Booking updates and alerts from Al Burhan Tours',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#047857',
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableLights: true,
      enableVibrate: true,
      bypassDnd: false,
      sound: 'default',
    });
    console.log('[Push] Android channel "alburhan-push" registered');
  } catch (err: any) {
    console.warn('[Push] setupAndroidChannel failed:', err?.message ?? err);
  }
}
