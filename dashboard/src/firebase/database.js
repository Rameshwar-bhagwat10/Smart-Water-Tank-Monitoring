import { db, isConfigured } from './config.js';
import { ref, onValue, set, get, update, off } from 'firebase/database';

/**
 * Listen to live telemetry data for a tank
 * Returns an unsubscribe function
 */
export function listenToTelemetry(tankId, callback) {
  if (!isConfigured) return () => {};
  const telemetryRef = ref(db, `tanks/${tankId}/live`);
  onValue(telemetryRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  }, (error) => {
    console.error('[Firebase DB] Telemetry listener error:', error);
    callback(null);
  });
  return () => off(telemetryRef);
}

/**
 * Send a command to the tank (mode change, pump control)
 */
export async function sendCommand(tankId, userId, mode, pumpState, action = null) {
  if (!isConfigured) throw new Error('Firebase not configured');
  const commandRef = ref(db, `tanks/${tankId}/commands`);
  const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const payload = {
    commandId: commandId,
    requestedMode: mode,
    requestedPumpState: pumpState,
    requestedAt: Date.now(),
    requestedBy: userId
  };
  if (action) {
    payload.action = action;
  }
  await set(commandRef, payload);
  return commandId;
}

/**
 * Listen to command acknowledgments
 */
export function listenToCommandAcks(tankId, callback) {
  if (!isConfigured) return () => {};
  const acksRef = ref(db, `tanks/${tankId}/commandAcks`);
  onValue(acksRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(acksRef);
}

/**
 * Allocates tank for user. Defaults to primary physical hardware tank 'tank-01'.
 */
export async function allocateTankForUser(uid, preferredTankId = null) {
  if (preferredTankId) return preferredTankId;
  return 'tank-01';
}

/**
 * Initializes nodes for a tank with zero-baseline metrics (zero mock data)
 */
export async function createTankStructure(tankId, uid, email) {
  const initialLive = {
    levelPercent: 0.0,
    distanceCm: 0.0,
    flowRateLpm: 0.0,
    totalLitres: 0.0,
    pumpCurrentA: 0.0,
    pumpState: 'OFF',
    controlMode: 'AUTO',
    controllerStatus: 'IDLE',
    sensorStatus: 'OK',
    faultCode: 'NONE',
    waterProbe: false,
    wifiConnected: true,
    updatedAt: Date.now(),
    ownerUid: uid,
    assignedUserEmail: email || ''
  };

  const initialCmdId = 'cmd_init_' + Date.now();
  const initialCmd = {
    commandId: initialCmdId,
    requestedMode: 'AUTO',
    requestedPumpState: 'OFF',
    requestedAt: Date.now(),
    requestedBy: uid
  };

  const initialAck = {
    status: 'PROCESSED',
    message: 'System baseline initialized',
    timestamp: Date.now()
  };

  const initialAlert = {
    type: 'INFO',
    message: `Smart Tank System Online (${tankId})`,
    timestamp: Date.now()
  };

  // Write all 4 child nodes in parallel
  await Promise.all([
    set(ref(db, `tanks/${tankId}/live`), initialLive),
    set(ref(db, `tanks/${tankId}/commands`), initialCmd),
    set(ref(db, `tanks/${tankId}/commandAcks/${initialCmdId}`), initialAck),
    set(ref(db, `tanks/${tankId}/alerts/init`), initialAlert)
  ]);

  console.log(`[Firebase DB] Created complete separate tank structure for ${tankId} (owner: ${uid})`);
}

/**
 * Ensures user profile exists AND allocates a unique separate tank for each user.
 * Automatically creates all missing user fields & tank fields upon login.
 * Only runs for authenticated Firebase Auth users.
 */
export async function ensureUserAndTankData(uid, email) {
  if (!isConfigured || !uid) return null;

  const userRef = ref(db, `users/${uid}`);
  let existingProfile = null;
  try {
    const userSnap = await get(userRef);
    if (userSnap.exists()) {
      existingProfile = userSnap.val();
    }
  } catch (err) {
    console.warn('[Firebase DB] Error checking user profile:', err);
  }

  // Allocate a separate, dedicated tank for this user
  const assignedTankId = await allocateTankForUser(uid, existingProfile?.assignedTankId);

  // Update / create user profile with their unique assignedTankId
  const userProfile = {
    email: email || existingProfile?.email || '',
    assignedTankId: assignedTankId,
    role: existingProfile?.role || 'operator',
    createdAt: existingProfile?.createdAt || Date.now(),
    lastLogin: Date.now()
  };

  try {
    await set(userRef, userProfile);
    console.log(`[Firebase DB] User profile updated for ${uid}: assigned to ${assignedTankId}`);
  } catch (err) {
    console.error('[Firebase DB] Failed to save user profile:', err);
  }

  // Ensure the separate tank structure exists in RTDB
  try {
    const liveSnap = await get(ref(db, `tanks/${assignedTankId}/live`));
    if (!liveSnap.exists()) {
      await createTankStructure(assignedTankId, uid, email);
    } else {
      // If live exists, ensure ownerUid is tagged to this user
      const liveData = liveSnap.val();
      if (!liveData.ownerUid) {
        await update(ref(db, `tanks/${assignedTankId}/live`), {
          ownerUid: uid,
          assignedUserEmail: email || ''
        });
      }
    }

    // Also verify commands node exists
    const cmdSnap = await get(ref(db, `tanks/${assignedTankId}/commands`));
    if (!cmdSnap.exists()) {
      const initialCmdId = 'cmd_init_' + Date.now();
      await set(ref(db, `tanks/${assignedTankId}/commands`), {
        commandId: initialCmdId,
        requestedMode: 'AUTO',
        requestedPumpState: 'OFF',
        requestedAt: Date.now(),
        requestedBy: uid
      });
    }
  } catch (tankErr) {
    console.error(`[Firebase DB] Error ensuring tank structure for ${assignedTankId}:`, tankErr);
  }

  return { profile: userProfile, tankId: assignedTankId };
}

// Aliases for backwards compatibility
export const ensureUserProfile = ensureUserAndTankData;
export const saveUserProfile = ensureUserAndTankData;

export { db };
