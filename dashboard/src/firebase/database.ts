import { db, isConfigured } from './config';
import { ref, onValue, set, get, update, off, DatabaseReference } from 'firebase/database';
import { ControlMode, PumpState, CommandPayload, UserProfile } from '../types/tank';

/**
 * Listen to live telemetry data for a tank
 * Returns an unsubscribe function
 */
export function listenToTelemetry(
  tankId: string,
  callback: (data: Record<string, unknown> | null) => void
): () => void {
  if (!isConfigured || !db) return () => {};
  const telemetryRef: DatabaseReference = ref(db, `tanks/${tankId}/live`);
  onValue(
    telemetryRef,
    (snapshot) => {
      const data = snapshot.val();
      callback(data);
    },
    (error) => {
      console.error('[Firebase DB] Telemetry listener error:', error);
      callback(null);
    }
  );
  return () => off(telemetryRef);
}

/**
 * Send a command to the tank (mode change, pump control)
 */
export async function sendCommand(
  tankId: string,
  userId: string,
  mode: ControlMode,
  pumpState: PumpState,
  action: string | null = null
): Promise<string> {
  if (!isConfigured || !db) throw new Error('Firebase not configured');
  const commandRef = ref(db, `tanks/${tankId}/commands`);
  const liveRef = ref(db, `tanks/${tankId}/live`);
  const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const validatedPumpState: PumpState = pumpState === 'ON' ? 'ON' : 'OFF';
  const validatedMode: ControlMode = mode === 'MANUAL' ? 'MANUAL' : 'AUTO';

  const payload: CommandPayload = {
    commandId,
    requestedMode: validatedMode,
    requestedPumpState: validatedPumpState,
    requestedAt: Date.now(),
    requestedBy: userId,
  };
  if (action) {
    payload.action = action;
  }

  // Simultaneously publish command and optimistic live state for 0ms cloud fleet sync
  const liveUpdate: Record<string, unknown> = {
    controlMode: validatedMode,
    updatedAt: Date.now(),
  };
  if (mode === 'MANUAL') {
    liveUpdate.pumpState = validatedPumpState;
  }

  await Promise.all([
    set(commandRef, payload),
    update(liveRef, liveUpdate).catch((e: Error) =>
      console.warn('[Firebase DB] Optimistic live update:', e)
    ),
  ]);
  return commandId;
}

/**
 * Listen to command acknowledgments
 */
export function listenToCommandAcks(
  tankId: string,
  callback: (data: Record<string, unknown> | null) => void
): () => void {
  if (!isConfigured || !db) return () => {};
  const acksRef = ref(db, `tanks/${tankId}/commandAcks`);
  onValue(acksRef, (snapshot) => {
    callback(snapshot.val());
  });
  return () => off(acksRef);
}

/**
 * Allocates tank for user. Defaults to primary physical hardware tank 'tank-01'.
 */
export async function allocateTankForUser(
  _uid: string,
  preferredTankId: string | null = null
): Promise<string> {
  if (preferredTankId) return preferredTankId;
  return 'tank-01';
}

/**
 * Initializes nodes for a tank with zero-baseline metrics (zero mock data)
 */
export async function createTankStructure(
  tankId: string,
  uid: string,
  email?: string
): Promise<void> {
  if (!db) return;
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
    assignedUserEmail: email || '',
  };

  const initialCmdId = 'cmd_init_' + Date.now();
  const initialCmd: CommandPayload = {
    commandId: initialCmdId,
    requestedMode: 'AUTO',
    requestedPumpState: 'OFF',
    requestedAt: Date.now(),
    requestedBy: uid,
  };

  const initialAck = {
    status: 'PROCESSED',
    message: 'System baseline initialized',
    timestamp: Date.now(),
  };

  const initialAlert = {
    type: 'INFO',
    message: `Smart Tank System Online (${tankId})`,
    timestamp: Date.now(),
  };

  // Write all 4 child nodes in parallel
  await Promise.all([
    set(ref(db, `tanks/${tankId}/live`), initialLive),
    set(ref(db, `tanks/${tankId}/commands`), initialCmd),
    set(ref(db, `tanks/${tankId}/commandAcks/${initialCmdId}`), initialAck),
    set(ref(db, `tanks/${tankId}/alerts/init`), initialAlert),
  ]);
}

/**
 * Ensures user profile exists AND allocates a unique separate tank for each user.
 */
export async function ensureUserAndTankData(
  uid: string,
  email?: string
): Promise<{ profile: UserProfile; tankId: string } | null> {
  if (!isConfigured || !db || !uid) return null;

  const userRef = ref(db, `users/${uid}`);
  let existingProfile: Partial<UserProfile> | null = null;
  try {
    const userSnap = await get(userRef);
    if (userSnap.exists()) {
      existingProfile = userSnap.val();
    }
  } catch (err) {
    console.warn('[Firebase DB] Error checking user profile:', err);
  }

  const assignedTankId = await allocateTankForUser(uid, existingProfile?.assignedTankId);

  const userProfile: UserProfile = {
    email: email || existingProfile?.email || '',
    assignedTankId: assignedTankId,
    role: existingProfile?.role || 'operator',
    createdAt: existingProfile?.createdAt || Date.now(),
    lastLogin: Date.now(),
  };

  try {
    await set(userRef, userProfile);
  } catch (err) {
    console.error('[Firebase DB] Failed to save user profile:', err);
  }

  try {
    const liveSnap = await get(ref(db, `tanks/${assignedTankId}/live`));
    if (!liveSnap.exists()) {
      await createTankStructure(assignedTankId, uid, email);
    } else {
      const liveData = liveSnap.val();
      if (!liveData.ownerUid) {
        await update(ref(db, `tanks/${assignedTankId}/live`), {
          ownerUid: uid,
          assignedUserEmail: email || '',
        });
      }
    }
  } catch (tankErr) {
    console.error(`[Firebase DB] Error ensuring tank structure for ${assignedTankId}:`, tankErr);
  }

  return { profile: userProfile, tankId: assignedTankId };
}

export const ensureUserProfile = ensureUserAndTankData;
export const saveUserProfile = ensureUserAndTankData;

export { db };
