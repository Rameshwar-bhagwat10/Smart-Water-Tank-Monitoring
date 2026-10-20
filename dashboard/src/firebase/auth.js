import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { ref, get, set, update, runTransaction } from 'firebase/database';
import { auth, db, firebaseConfig } from './config.js';

/**
 * Scan existing tank nodes and user records to find highest tank number in use.
 */
function scanMaxTankNumber(allTanks = {}, allUsers = {}) {
  let maxNum = 0;
  if (allTanks && typeof allTanks === 'object') {
    Object.keys(allTanks).forEach((key) => {
      const match = key.match(/^tank-?(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
  }
  if (allUsers && typeof allUsers === 'object') {
    Object.values(allUsers).forEach((u) => {
      if (u?.assignedTankId) {
        const match = String(u.assignedTankId).match(/^tank-?(\d+)$/i);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
    });
  }
  return maxNum;
}

/**
 * Calculates the next sequential available tank ID for UI preview.
 */
export function getNextAvailableTankId(allTanks = {}, allUsers = {}) {
  const max = scanMaxTankNumber(allTanks, allUsers);
  const nextNum = max + 1;
  const padded = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
  return `tank-${padded}`;
}

/**
 * Calculates a Set of currently assigned tank IDs.
 */
export function getAssignedTankIds(allTanks = {}, allUsers = {}) {
  const assigned = new Set();
  if (allUsers && typeof allUsers === 'object') {
    Object.values(allUsers).forEach((u) => {
      if (u && u.enabled !== false && u.assignedTankId) {
        assigned.add(String(u.assignedTankId).toLowerCase().trim());
      }
    });
  }
  if (allTanks && typeof allTanks === 'object') {
    Object.entries(allTanks).forEach(([id, t]) => {
      if (t && t.assignedTo && allUsers[t.assignedTo]?.enabled !== false) {
        assigned.add(String(id).toLowerCase().trim());
      }
    });
  }
  return assigned;
}

/**
 * Returns a consistent friendly name matching the tank ID.
 */
export function getConsistentTankName(tankId, allTanks = {}) {
  if (!tankId) return 'Water Storage Unit 01';
  const cleanId = String(tankId).trim().toLowerCase();
  if (allTanks && allTanks[cleanId]?.name) {
    return allTanks[cleanId].name;
  }
  const match = cleanId.match(/^tank-?(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const padded = num < 10 ? `0${num}` : `${num}`;
    return `Water Storage Unit ${padded}`;
  }
  const cleanSuffix = cleanId.replace(/^tank-?/i, '').replace(/[-_]/g, ' ').trim();
  return `Water Storage Unit ${cleanSuffix.toUpperCase() || cleanId.toUpperCase()}`;
}

/**
 * Calculates the available unassigned tanks and next auto-generated tank.
 * Excludes any tank that is currently assigned to an active operator.
 */
export function getAvailableTankOptions(allTanks = {}, allUsers = {}) {
  const assigned = getAssignedTankIds(allTanks, allUsers);
  const available = [];

  // 1. Next sequential auto-generated tank
  const nextId = getNextAvailableTankId(allTanks, allUsers);
  if (!assigned.has(nextId)) {
    available.push({
      id: nextId,
      name: getConsistentTankName(nextId, allTanks),
      isNext: true
    });
  }

  // 2. Any existing tank that is currently unassigned
  if (allTanks && typeof allTanks === 'object') {
    Object.keys(allTanks).sort().forEach((id) => {
      const cleanId = id.toLowerCase().trim();
      if (!assigned.has(cleanId) && cleanId !== nextId) {
        available.push({
          id: cleanId,
          name: getConsistentTankName(cleanId, allTanks),
          isExisting: true
        });
      }
    });
  }

  const defaultId = available[0]?.id || nextId;
  return {
    available,
    nextId,
    assigned,
    defaultTankId: defaultId,
    defaultTankName: getConsistentTankName(defaultId, allTanks)
  };
}

/**
 * Concurrency-safe atomic tank reservation using Firebase RTDB transactions.
 */
export async function allocateNextTankId(database) {
  if (!database) throw new Error('Database is not initialized.');
  const allocRef = ref(database, 'system/tankAllocation');

  const [tanksSnap, usersSnap] = await Promise.all([
    get(ref(database, 'tanks')),
    get(ref(database, 'users'))
  ]);
  const currentMax = scanMaxTankNumber(tanksSnap.val() || {}, usersSnap.val() || {});

  const result = await runTransaction(allocRef, (currentData) => {
    let nextNum = 1;
    if (currentData && typeof currentData.lastAllocatedNumber === 'number') {
      nextNum = Math.max(currentData.lastAllocatedNumber + 1, currentMax + 1);
    } else {
      nextNum = currentMax + 1;
    }
    return {
      lastAllocatedNumber: nextNum,
      updatedAt: Date.now()
    };
  });

  if (!result.committed) {
    throw new Error('Failed to atomically reserve next sequential tank ID.');
  }

  const num = result.snapshot.val().lastAllocatedNumber;
  const padded = num < 10 ? `0${num}` : `${num}`;
  return `tank-${padded}`;
}

/**
 * Sign in user with email and password.
 */
export async function loginWithEmail(email, password) {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Check your environment configuration.');
  }

  if (!email || !password) {
    throw new Error('Please enter both email and password.');
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await getUserProfile(userCredential.user);
    if (!profile || profile.enabled === false) {
      await signOut(auth);
      throw new Error(profile?.error || 'Account is disabled or not provisioned.');
    }
    return { user: userCredential.user, profile };
  } catch (error) {
    let friendlyMessage = error.message || 'Authentication failed. Please check your credentials.';
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      friendlyMessage = 'Invalid email or password.';
    } else if (error.code === 'auth/too-many-requests') {
      friendlyMessage = 'Access temporarily disabled due to multiple failed attempts. Try again later.';
    } else if (error.code === 'auth/network-request-failed') {
      friendlyMessage = 'Network error. Please check your internet connection.';
    }
    const enhancedError = new Error(friendlyMessage);
    enhancedError.code = error.code;
    throw enhancedError;
  }
}

/**
 * Sign out current user.
 */
export async function logoutUser() {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[Firebase Auth] Sign out error:', error.message);
    throw error;
  }
}

/**
 * Fetch user profile and role from /users/{uid}.
 * Security requirement: Fails closed. Does NOT auto-elevate or guess roles from email.
 */
export async function getUserProfile(user) {
  if (!user) return null;

  const uid = typeof user === 'string' ? user : user.uid;
  const email = (typeof user === 'object' && user.email) ? user.email.toLowerCase() : '';

  if (!db || !uid) {
    return { email, role: null, enabled: false, assignedTankId: null, error: 'Database uninitialized' };
  }

  try {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);

    // Fail closed: Profile must exist in database
    if (!snapshot.exists()) {
      console.warn(`[Firebase Auth] Access denied: User ${email} (${uid}) has no database record.`);
      return {
        email,
        role: null,
        enabled: false,
        assignedTankId: null,
        error: 'Access Not Configured: Your account has not been provisioned by an administrator.'
      };
    }

    const data = snapshot.val();

    // Check account enabled status
    if (data.enabled === false) {
      console.warn(`[Firebase Auth] Access denied: User ${email} (${uid}) is disabled.`);
      return {
        email,
        role: null,
        enabled: false,
        assignedTankId: null,
        error: 'Account Deactivated: This operator account has been de-provisioned.'
      };
    }

    // Role verification
    if (data.role !== 'admin' && data.role !== 'operator') {
      console.warn(`[Firebase Auth] Invalid role for ${email}: ${data.role}`);
      return {
        email,
        role: null,
        enabled: false,
        assignedTankId: null,
        error: 'Access Denied: Unrecognized system role.'
      };
    }

    return {
      email: data.email || email,
      role: data.role,
      enabled: true,
      assignedTankId: data.role === 'admin' ? null : (data.assignedTankId || null),
      createdAt: data.createdAt || Date.now()
    };
  } catch (error) {
    console.error(`[Firebase Auth] Failed to fetch profile for ${uid}:`, error.message);
    return { email, role: null, enabled: false, assignedTankId: null, error: error.message };
  }
}

/**
 * Admin action: Register a new Operator and bind them to their auto-assigned water tank.
 * Concurrency-safe and cleans up secondary app instances reliably.
 */
export async function createOperatorUser(email, password, requestedTankId, tankName) {
  if (!auth.currentUser) {
    throw new Error('Only authenticated administrators can register operators.');
  }

  if (!email || !password) {
    throw new Error('Email and password are required.');
  }

  const cleanEmail = email.trim().toLowerCase();

  // Concurrency-safe allocation
  let cleanTankId = requestedTankId ? requestedTankId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') : null;
  if (!cleanTankId) {
    cleanTankId = await allocateNextTankId(db);
  } else {
    // Verify that the requested tank is not already assigned to an active operator
    const usersSnap = await get(ref(db, 'users'));
    const allUsers = usersSnap.val() || {};
    const existingOp = Object.values(allUsers).find(
      u => u && u.enabled !== false && String(u.assignedTankId).toLowerCase() === cleanTankId
    );
    if (existingOp) {
      throw new Error(`Tank '${cleanTankId.toUpperCase()}' is already assigned to ${existingOp.email}. Each tank can only be assigned to one operator.`);
    }
  }

  const cleanTankName = (tankName && tankName.trim().length > 0)
    ? tankName.trim()
    : getConsistentTankName(cleanTankId);

  // Secondary app creation for non-disruptive user provisioning
  const secondaryAppName = `OpCreate_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  let newUid = null;
  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
    newUid = userCredential.user.uid;
    await signOut(secondaryAuth);
  } catch (authErr) {
    let msg = authErr.message;
    if (authErr.code === 'auth/email-already-in-use') {
      msg = `Operator email '${cleanEmail}' is already registered in Firebase Authentication.`;
    } else if (authErr.code === 'auth/weak-password') {
      msg = 'Password is too weak. Please provide at least 6 characters.';
    }
    const err = new Error(msg);
    err.code = authErr.code;
    throw err;
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) { /* ignore */ }
  }

  // Persist user record and initialize clean tank node
  try {
    const userProfile = {
      email: cleanEmail,
      role: 'operator',
      enabled: true,
      assignedTankId: cleanTankId,
      createdAt: Date.now()
    };
    await set(ref(db, `users/${newUid}`), userProfile);

    // Initialize tank node with honest uninitialized telemetry state
    const tankRef = ref(db, `tanks/${cleanTankId}`);
    const tankSnap = await get(tankRef);
    if (!tankSnap.exists()) {
      await set(tankRef, {
        name: cleanTankName,
        assignedTo: newUid,
        live: {
          levelPercent: null,
          distanceCm: null,
          flowRateLpm: 0.0,
          totalLitres: 0.0,
          pumpCurrentA: 0.0,
          pumpState: 'OFF',
          controlMode: 'AUTO',
          sensorStatus: 'INITIALIZING',
          wifiConnected: false,
          updatedAt: null
        },
        commands: {
          requestedMode: 'AUTO',
          requestedPumpState: 'OFF',
          commandId: `init_${Date.now()}`,
          requestedAt: Date.now(),
          requestedBy: newUid
        },
        history: {},
        alerts: {}
      });
      console.log(`[Firebase DB] Initialized tank node: ${cleanTankId}`);
    } else {
      await update(tankRef, { assignedTo: newUid });
    }

    // Automatically register the physical ESP8266 controller in deviceRegistry for Security Rules validation
    try {
      const devUid = `device_esp8266_${cleanTankId.replace(/[^a-z0-9]/g, '')}`;
      await registerDevice(devUid, cleanTankId);
      console.log(`[Firebase DB] Registered hardware device: ${devUid}`);
    } catch (devErr) {
      console.warn('[Firebase DB] Device auto-registration notice:', devErr.message);
    }

    return {
      success: true,
      uid: newUid,
      email: cleanEmail,
      tankId: cleanTankId,
      tankName: cleanTankName
    };
  } catch (dbErr) {
    console.error('[Firebase DB] Failed to persist operator profile:', dbErr.message);
    throw new Error(`Auth account created, but database profile creation failed: ${dbErr.message}`);
  }
}

/**
 * Admin action: Safely de-provision an operator user record.
 * Marks enabled: false and unassigns the tank so access is revoked in database rules.
 */
export async function deleteOperatorUser(targetUid, tankId = null) {
  if (!auth.currentUser) {
    throw new Error('Only authenticated administrators can de-provision operators.');
  }

  try {
    await update(ref(db, `users/${targetUid}`), {
      enabled: false,
      assignedTankId: null,
      disabledAt: Date.now()
    });

    if (tankId) {
      await update(ref(db, `tanks/${tankId}`), { assignedTo: null });
    }
    return { success: true };
  } catch (error) {
    console.error('[Firebase Auth] Failed to de-provision operator user:', error.message);
    throw error;
  }
}

/**
 * Admin action: Provision a physical controller in /deviceRegistry/{deviceUid}.
 */
export async function registerDevice(deviceUid, assignedTankId, firmwareVersion = '1.0.0') {
  if (!auth.currentUser) {
    throw new Error('Only authenticated administrators can provision devices.');
  }

  const cleanTankId = assignedTankId.trim().toLowerCase();
  await set(ref(db, `deviceRegistry/${deviceUid}`), {
    enabled: true,
    assignedTankId: cleanTankId,
    firmwareVersion,
    createdAt: Date.now(),
    lastProvisionedAt: Date.now()
  });
  return { success: true, deviceUid, assignedTankId: cleanTankId };
}

/**
 * Observe authentication state changes and fetch the user profile.
 */
export function subscribeToAuthState(callback) {
  if (!auth) {
    callback(null, null);
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user);
      callback(user, profile);
    } else {
      callback(null, null);
    }
  });
}
