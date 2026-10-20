/**
 * Bootstrap Master Admin User and Initial Tank Schema.
 * Reads Firebase configuration from dashboard/.env.local.
 *
 * Usage:
 *   node scripts/create-admin-user.js <email> <password>
 *   OR set environment variables: ADMIN_EMAIL and ADMIN_PASSWORD
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

const ADMIN_EMAIL = process.argv[2] || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.argv[3] || process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('\n[ERROR] Both admin email and password must be explicitly provided.');
  console.error('Hardcoded fallback passwords have been removed (SEC-004).\n');
  console.error('Usage:');
  console.error('  node scripts/create-admin-user.js <admin_email> <admin_password>');
  console.error('  OR: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin-user.js\n');
  process.exit(1);
}

async function main() {
  console.log('====================================================');
  console.log('   SMART WATER TANK — MASTER ADMIN PROVISIONING');
  console.log('====================================================\n');

  const config = loadEnv();
  console.log(`Firebase Project:  ${config.projectId}`);
  console.log(`Database Endpoint: ${config.databaseURL}`);
  console.log(`Admin Email:       ${ADMIN_EMAIL}`);

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);

  let adminUser = null;

  // 1. Create or Sign In Admin in Firebase Auth
  console.log('\n[1/3] Registering / Authenticating Master Admin...');
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
    adminUser = userCredential.user;
    console.log(`  ✓ Master Admin account created! UID: ${adminUser.uid}`);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`  ℹ Admin account already exists. Signing in...`);
      try {
        const userCredential = await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
        adminUser = userCredential.user;
        console.log(`  ✓ Signed in successfully! UID: ${adminUser.uid}`);
      } catch (signInErr) {
        console.error(`  ✗ Sign in failed: [${signInErr.code}] ${signInErr.message}`);
        console.error(`  If you changed the password previously, pass it: node scripts/create-admin-user.js ${ADMIN_EMAIL} <your-password>`);
        process.exit(1);
      }
    } else if (err.code === 'auth/operation-not-allowed') {
      console.error(`\n[ACTION REQUIRED] Firebase Authentication Email/Password provider is disabled.`);
      console.error(`Please enable it in the Firebase Console:`);
      console.error(`  1. Go to https://console.firebase.google.com/project/${config.projectId}/authentication/providers`);
      console.error(`  2. Enable "Email/Password" and save.`);
      process.exit(1);
    } else {
      console.error(`  ✗ Admin registration failed: [${err.code}] ${err.message}`);
      process.exit(1);
    }
  }

  // 2. Set Admin profile in /users/{adminUid}
  console.log('\n[2/3] Writing Admin record to /users/' + adminUser.uid + '...');
  try {
    const userRef = ref(db, `users/${adminUser.uid}`);
    await set(userRef, {
      email: ADMIN_EMAIL.toLowerCase(),
      role: 'admin',
      createdAt: Date.now()
    });
    console.log(`  ✓ /users/${adminUser.uid} configured with role: 'admin' (No tank assigned; supervisory access)`);
  } catch (err) {
    console.error(`  ✗ Failed to write user profile: ${err.message}`);
    process.exit(1);
  }

  console.log('\n[3/3] Tank fleet state: Initialized clean (Operators will auto-provision starting from tank-01).');

  console.log('\n====================================================');
  console.log('   PROVISIONING COMPLETE — MASTER ADMIN READY');
  console.log('====================================================');
  console.log(`  Portal URL:  http://localhost:5173/`);
  console.log(`  Email:       ${ADMIN_EMAIL}`);
  console.log(`  Password:    [REDACTED / CONFIGURED]`);
  console.log(`  Role:        admin`);
  console.log(`  UID:         ${adminUser.uid}`);
  console.log('====================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
