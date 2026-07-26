/**
 * Firebase Web SDK initialisation for Al Burhan Tours & Travels.
 * Reads config from VITE_FIREBASE_* environment variables.
 * These are safe to expose in the browser — they are not secrets.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "",
};

let _app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;

export function isFirebaseAvailable(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length) { _app = existing[0]; return _app; }
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase not configured: set VITE_FIREBASE_* env vars");
  }
  _app = initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseMessagingInstance(): Messaging {
  if (_messaging) return _messaging;
  _messaging = getMessaging(getFirebaseApp());
  return _messaging;
}
