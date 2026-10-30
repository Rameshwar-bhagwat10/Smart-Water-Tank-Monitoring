import { initializeApp, getApps, getApp } from 'firebase/app';
import 'firebase/auth';
import 'firebase/database';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

/**
 * Standard project fallback configuration.
 * Note: Firebase Web configuration identifies public project resources and is not
 * an authorization secret. Access is enforced by Firebase Security Rules and Auth.
 */
const KNOWN_CONFIG = {
  apiKey: "AIzaSyCd20LOQTNcqOWLAQn6Z42aWat3l9zsQ0g",
  authDomain: "smart-water-tank-monitor-c38c0.firebaseapp.com",
  databaseURL: "https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com",
  projectId: "smart-water-tank-monitor-c38c0",
  appId: "1:792718502432:web:7859d2308094c480e56a45"
};

function isValidValue(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '' || trimmed.startsWith('YOUR_') || trimmed.includes('your-project-id')) {
    return false;
  }
  return true;
}

function getFirebaseConfig() {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) 
    ? import.meta.env 
    : (typeof process !== 'undefined' && process.env ? process.env : {});

  const apiKey = isValidValue(env.VITE_FIREBASE_API_KEY) ? env.VITE_FIREBASE_API_KEY : KNOWN_CONFIG.apiKey;
  const authDomain = isValidValue(env.VITE_FIREBASE_AUTH_DOMAIN) ? env.VITE_FIREBASE_AUTH_DOMAIN : KNOWN_CONFIG.authDomain;
  const databaseURL = isValidValue(env.VITE_FIREBASE_DATABASE_URL) ? env.VITE_FIREBASE_DATABASE_URL : KNOWN_CONFIG.databaseURL;
  const projectId = isValidValue(env.VITE_FIREBASE_PROJECT_ID) ? env.VITE_FIREBASE_PROJECT_ID : KNOWN_CONFIG.projectId;
  const appId = isValidValue(env.VITE_FIREBASE_APP_ID) ? env.VITE_FIREBASE_APP_ID : KNOWN_CONFIG.appId;

  return {
    apiKey,
    authDomain,
    databaseURL,
    projectId,
    appId
  };
}

const validatedConfig = getFirebaseConfig();

let app = null;
let auth = null;
let db = null;
let isConfigured = false;
let configError = null;

try {
  app = getApps().length === 0 ? initializeApp(validatedConfig) : getApp();
  auth = getAuth(app);
  try {
    setPersistence(auth, browserLocalPersistence).catch((pErr) => {
      console.warn('[Firebase Auth] Persistence note:', pErr.message);
    });
  } catch (pErr) {
    console.warn('[Firebase Auth] Persistence setup skipped:', pErr);
  }
  try {
    db = getDatabase(app, validatedConfig.databaseURL);
  } catch (dErr) {
    db = getDatabase(app);
  }
  isConfigured = true;
  console.log('[Firebase] Successfully initialized Firebase modular SDK.');
} catch (err) {
  console.error('[Firebase] Primary initialization failed, attempting fallback recovery:', err);
  try {
    app = initializeApp(KNOWN_CONFIG, 'emergency-app');
    auth = getAuth(app);
    db = getDatabase(app, KNOWN_CONFIG.databaseURL);
    isConfigured = true;
    configError = null;
    console.log('[Firebase] Successfully recovered using emergency fallback config.');
  } catch (fallbackErr) {
    console.error('[Firebase] Critical initialization failure:', fallbackErr);
    isConfigured = false;
    configError = fallbackErr.message || String(fallbackErr);
  }
}

export { app, auth, db, isConfigured, configError, validatedConfig as firebaseConfig };
