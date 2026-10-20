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
export async function sendCommand(tankId, userId, mode, pumpState) {
  if (!isConfigured) throw new Error('Firebase not configured');
  const commandRef = ref(db, `tanks/${tankId}/commands`);
  const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  await set(commandRef, {
    commandId: commandId,
    requestedMode: mode,
    requestedPumpState: pumpState,
    requestedAt: Date.now(),
    requestedBy: userId
  });
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
 * Scans tanks sequentially (tank-01, tank-02, tank-03...) to find the tank
 * owned by this user, or the next available unused tank slot.
 * Ensures every user gets their own separate tank.
 */
export async function allocateTankForUser(uid, preferredTankId = null) {
  // If user already has a preferred tank, check if it's already theirs or free
  if (preferredTankId) {
    try {
      const liveSnap = await get(ref(db, `tanks/${preferredTankId}/live`));
      if (!liveSnap.exists()) {
        // Preferred tank is completely free
        return preferredTankId;
      }
      const data = liveSnap.val();
      // If already owned by this user, keep it!
      if (!data.ownerUid || data.ownerUid === uid) {
        return preferredTankId;
      }
      // If owned by someone else, user was mistakenly sharing! Allocate a separate tank.
    } catch (e) {
      console.warn(`[Firebase DB] Error checking preferred tank ${preferredTankId}:`, e);
    }
  }

  // Scan tank-01 through tank-99 to find free or user-owned tank
  for (let i = 1; i <= 99; i++) {
    const candidateId = `tank-${String(i).padStart(2, '0')}`;
    try {
      const snap = await get(ref(db, `tanks/${candidateId}/live`));
      if (!snap.exists()) {
        // candidateId is free!
        return candidateId;
      }
      const liveData = snap.val();
      if (liveData && liveData.ownerUid === uid) {
        // User already owns this candidate tank!
        return candidateId;
      }
    } catch (err) {
      console.warn(`[Firebase DB] Error scanning candidate ${candidateId}:`, err);
    }
  }

  return `tank-${uid.substring(0, 6)}`;
}

/**
 * Fully initializes all 4 child nodes for a tank matching initial JSON:
 * - /tanks/${tankId}/live
 * - /tanks/${tankId}/commands
 * - /tanks/${tankId}/commandAcks/${cmdId}
 * - /tanks/${tankId}/alerts/init
 */
export async function createTankStructure(tankId, uid, email) {
  const initialLive = {
    levelPercent: 75.0,
    distanceCm: 25.0,
    flowRateLpm: 0.0,
    totalLitres: 0.0,
    pumpCurrentA: 0.0,
    pumpState: 'OFF',
    controlMode: 'AUTO',
    controllerStatus: 'IDLE',
    sensorStatus: 'OK',
    faultCode: 'NONE',
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
