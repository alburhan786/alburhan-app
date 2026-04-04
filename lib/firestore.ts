import { fetch } from 'expo/fetch';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export async function getUserFromFirestore(userId: number): Promise<Record<string, any> | null> {
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) return null;
  try {
    const resp = await fetch(`${FIRESTORE_BASE}/users/${userId}`);
    if (!resp.ok) return null;
    const doc = await resp.json();
    if (!doc.fields) return null;
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(doc.fields as Record<string, any>)) {
      result[key] = val.stringValue ?? val.integerValue ?? val.booleanValue ?? val.timestampValue ?? null;
    }
    return result;
  } catch (err: any) {
    console.warn('[Firestore] getUserFromFirestore error:', err?.message ?? err);
    return null;
  }
}

export async function saveTokenByPhone(phone: string, expoPushToken: string): Promise<void> {
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) return;
  const sanitized = phone.replace(/\D/g, '');
  if (!sanitized) return;
  try {
    const url = `${FIRESTORE_BASE}/push_tokens/${sanitized}?updateMask.fieldPaths=expoPushToken&updateMask.fieldPaths=phone&updateMask.fieldPaths=updatedAt`;
    const body = {
      fields: {
        expoPushToken: { stringValue: expoPushToken },
        phone: { stringValue: sanitized },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    };
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      console.log(`[Firestore] Push token saved by phone ...${sanitized.slice(-4)}`);
    } else {
      const text = await resp.text().catch(() => '');
      console.warn(`[Firestore] Failed to save token by phone (${resp.status}): ${text}`);
    }
  } catch (err: any) {
    console.warn('[Firestore] saveTokenByPhone error:', err?.message ?? err);
  }
}

export async function saveTokenToFirestore(userId: number, expoPushToken: string): Promise<void> {
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    console.warn('[Firestore] EXPO_PUBLIC_FIREBASE_PROJECT_ID not set — skipping token save');
    return;
  }
  try {
    const body = {
      fields: {
        expoPushToken: { stringValue: expoPushToken },
        userId: { integerValue: String(userId) },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    };
    const url = `${FIRESTORE_BASE}/users/${userId}?updateMask.fieldPaths=expoPushToken&updateMask.fieldPaths=userId&updateMask.fieldPaths=updatedAt`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`[Firestore] Failed to save token (${resp.status}): ${text}`);
    } else {
      console.log(`[Firestore] Token saved for user ${userId}`);
    }
  } catch (err: any) {
    console.warn('[Firestore] saveTokenToFirestore error:', err?.message ?? err);
  }
}
