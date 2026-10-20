/**
 * Provision a test user and check live Firebase configuration.
 * Reads config dynamically from dashboard/.env.local without exposing secrets.
 * Run with: node scripts/create-test-user.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { ref, set, get, getDatabase } from 'firebase/database';

function loadEnv() {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'dashboard/.env.local')
  ];
  const envPath = possiblePaths.find(p => fs.existsSync(p));
  if (!envPath) {
    throw new Error('dashboard/.env.local not found. Please ensure it exists.');
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }

  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID
  };
}

const TEST_EMAIL = 'operator@smartwatertank.local';
const TEST_PASSWORD = 'WaterTankPassword2026!';

async function main() {
  console.log('=== FIREBASE LIVE ENVIRONMENT & USER CREATION CHECK ===\n');

  const config = loadEnv();
  console.log(`Target Firebase Project: ${config.projectId}`);
  console.log(`Database Endpoint: ${config.databaseURL}`);

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);

  let user = null;

  // 1. Try to create test user in Firebase Auth
  console.log(`\nAttempting to register dummy test user: ${TEST_EMAIL}...`);
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    user = userCredential.user;
    console.log(`✓ User successfully created! User UID: ${user.uid}`);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`ℹ User already exists. Signing in with existing test credentials...`);
      try {
        const userCredential = await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
        user = userCredential.user;
        console.log(`✓ Signed in successfully! User UID: ${user.uid}`);
      } catch (signInErr) {
        console.error(`✗ Failed to sign in existing user: ${signInErr.code} - ${signInErr.message}`);
        return;
      }
    } else if (err.code === 'auth/operation-not-allowed') {
      console.error(`\n[ACTION REQUIRED] Firebase Authentication Email/Password provider is not enabled yet in your project.`);
      console.error(`Please enable it in the Firebase Console:`);
      console.error(`  1. Go to https://console.firebase.google.com/project/${config.projectId}/authentication/providers`);
      console.error(`  2. Click "Email/Password" and toggle "Enable", then click "Save".`);
      console.error(`  3. Re-run this script: node scripts/create-test-user.js`);
      return;
    } else {
      console.error(`✗ User creation failed: [${err.code}] ${err.message}`);
      return;
    }
  }

  // 2. Provision Access Role in Realtime Database
  console.log(`\nProvisioning access record at /access/${user.uid}...`);
  try {
    const accessRef = ref(db, `access/${user.uid}`);
    await set(accessRef, {
      enabled: true,
      role: 'admin'
    });
    console.log(`✓ Access record provisioned: { enabled: true, role: 'admin' }`);
  } catch (err) {
    console.warn(`! Could not write to /access/${user.uid} directly: ${err.message}`);
    console.log(`  (This is expected if database rules with .write: false are already published in Firebase Console.)`);
    console.log(`  To add this record manually in Firebase Console -> Realtime Database -> Data:`);
    console.log(`  Key: access -> ${user.uid} -> { "enabled": true, "role": "admin" }`);
  }

  // 3. Check Live Telemetry Node
  console.log(`\nChecking live telemetry path /devices/tank-01/live...`);
  try {
    const liveRef = ref(db, 'devices/tank-01/live');
    const snapshot = await get(liveRef);
    if (snapshot.exists()) {
      console.log(`✓ Live telemetry node exists with data:`, snapshot.val());
    } else {
      console.log(`ℹ Live telemetry node does not exist yet. Initializing baseline test telemetry...`);
      try {
        await set(liveRef, {
          levelPercent: 72.5,
          distanceCm: 27.5,
          flowRateLpm: 14.8,
          totalLitres: 342.0,
          pumpCurrentA: 2.84,
          pumpState: 'OFF',
          controlMode: 'AUTO',
          sensorStatus: 'OK',
          wifiConnected: true,
          updatedAt: Date.now()
        });
        console.log(`✓ Seeded baseline test telemetry in /devices/tank-01/live for instant dashboard testing!`);
      } catch (writeErr) {
        console.log(`! Note: Could not write test telemetry directly (Security Rules may restrict client writes to /live): ${writeErr.message}`);
      }
    }
  } catch (readErr) {
    console.warn(`! Note reading /devices/tank-01/live: ${readErr.message}`);
  }

  console.log('\n=== TEST CREDENTIALS READY FOR DASHBOARD ===');
  console.log(`Email:    ${TEST_EMAIL}`);
  console.log(`Password: ${TEST_PASSWORD}`);
  console.log(`Role:     admin (full monitoring & command authorization)`);
  console.log(`UID:      ${user.uid}`);
  console.log('\nYou can now open http://localhost:5173/ and log in with these credentials!');
}

main().catch((err) => {
  console.error('Script execution error:', err.message);
});
