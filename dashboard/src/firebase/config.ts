import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

const KNOWN_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyCd20LOQTNcqOWLAQn6Z42aWat3l9zsQ0g',
  authDomain: 'smart-water-tank-monitor-c38c0.firebaseapp.com',
  databaseURL: 'https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com',
  projectId: 'smart-water-tank-monitor-c38c0',
  appId: '1:792718502432:web:7859d2308094c480e56a45',
};

function isValidValue(val: unknown): val is string {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '' || trimmed.startsWith('YOUR_') || trimmed.includes('your-project-id')) {
    return false;
  }
  return true;
}

function getFirebaseConfig(): FirebaseConfig {
  const env: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? process.env : {};

  const apiKey = isValidValue(env.NEXT_PUBLIC_FIREBASE_API_KEY)
    ? env.NEXT_PUBLIC_FIREBASE_API_KEY
    : isValidValue(env.VITE_FIREBASE_API_KEY)
    ? env.VITE_FIREBASE_API_KEY
    : KNOWN_CONFIG.apiKey;

  const authDomain = isValidValue(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)
    ? env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    : isValidValue(env.VITE_FIREBASE_AUTH_DOMAIN)
    ? env.VITE_FIREBASE_AUTH_DOMAIN
    : KNOWN_CONFIG.authDomain;

  const databaseURL = isValidValue(env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
    ? env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
    : isValidValue(env.VITE_FIREBASE_DATABASE_URL)
    ? env.VITE_FIREBASE_DATABASE_URL
    : KNOWN_CONFIG.databaseURL;

  const projectId = isValidValue(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
    ? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    : isValidValue(env.VITE_FIREBASE_PROJECT_ID)
    ? env.VITE_FIREBASE_PROJECT_ID
    : KNOWN_CONFIG.projectId;

  const appId = isValidValue(env.NEXT_PUBLIC_FIREBASE_APP_ID)
    ? env.NEXT_PUBLIC_FIREBASE_APP_ID
    : isValidValue(env.VITE_FIREBASE_APP_ID)
    ? env.VITE_FIREBASE_APP_ID
    : KNOWN_CONFIG.appId;

  return {
    apiKey,
    authDomain,
    databaseURL,
    projectId,
    appId,
  };
}

const validatedConfig = getFirebaseConfig();

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;
let isConfigured = false;
let configError: string | null = null;

try {
  app = getApps().length === 0 ? initializeApp(validatedConfig) : getApp();
  auth = getAuth(app);
  if (typeof window !== 'undefined') {
    try {
      setPersistence(auth, browserLocalPersistence).catch((pErr: Error) => {
        console.warn('[Firebase Auth] Persistence note:', pErr.message);
      });
    } catch (pErr) {
      console.warn('[Firebase Auth] Persistence setup skipped:', pErr);
    }
  }
  try {
    db = getDatabase(app, validatedConfig.databaseURL);
  } catch {
    db = getDatabase(app);
  }
  isConfigured = true;
} catch (err: unknown) {
  try {
    app = initializeApp(KNOWN_CONFIG, 'emergency-app');
    auth = getAuth(app);
    db = getDatabase(app, KNOWN_CONFIG.databaseURL);
    isConfigured = true;
    configError = null;
  } catch (fallbackErr: unknown) {
    isConfigured = false;
    configError = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
  }
}

export { app, auth, db, isConfigured, configError, validatedConfig as firebaseConfig };
