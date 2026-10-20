import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

/**
 * Validate that mandatory Firebase client environment variables are defined.
 * Note: Firebase Web configuration identifies public project resources and is not
 * an authorization mechanism. Access is enforced by Firebase Security Rules and Auth.
 */
function getFirebaseConfig() {
  const env = import.meta.env;

  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };

  const missingKeys = Object.entries(config)
    .filter(([_, value]) => !value || typeof value !== 'string' || value.trim() === '')
    .map(([key]) => `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);

  if (missingKeys.length > 0) {
    const errorMsg = `[Firebase Config] Missing required environment variable(s): ${missingKeys.join(', ')}. Ensure dashboard/.env.local is configured.`;
    console.error(errorMsg);
    return { config: null, error: errorMsg };
  }

  return { config, error: null };
}

const { config: validatedConfig, error: configError } = getFirebaseConfig();

let app = null;
let auth = null;
let db = null;
let isConfigured = false;

if (validatedConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(validatedConfig) : getApp();
    auth = getAuth(app);
    // Explicitly configure local persistence for browser sessions
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('[Firebase Auth] Could not set local persistence:', err.message);
    });
    db = getDatabase(app);
    isConfigured = true;
    console.log('[Firebase] Successfully initialized Firebase modular SDK.');
  } catch (err) {
    console.error('[Firebase] Initialization failure:', err.message);
  }
}

export { app, auth, db, isConfigured, configError, validatedConfig as firebaseConfig };
