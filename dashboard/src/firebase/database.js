import {
  ref,
  onValue,
  set,
  query,
  limitToLast
} from 'firebase/database';
import { db } from './config.js';
import { validateLiveTelemetry, validateCommandPayload } from './validation.js';

let commandInFlight = false;

/**
 * Subscribe to the special Firebase RTDB connection status node.
 */
export function subscribeToDatabaseConnection(callback) {
  if (!db) {
    callback(false);
    return () => {};
  }

  const connectedRef = ref(db, '.info/connected');
  return onValue(connectedRef, (snap) => {
    callback(snap.val() === true);
  }, (err) => {
    console.warn('[Firebase DB] Connection listener warning:', err.message);
    callback(false);
  });
}

/**
 * Subscribe to live telemetry for a specific tank at /tanks/{tankId}/live.
 */
export function subscribeToTankLive(tankId, onData, onError) {
  if (!db || !tankId) {
    if (onError) onError(new Error('Firebase Database or tankId is not provided.'));
    return () => {};
  }

  const liveRef = ref(db, `tanks/${tankId}/live`);

  return onValue(
    liveRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const raw = snapshot.val();
      const validated = validateLiveTelemetry(raw);
      onData(validated);
    },
    (error) => {
      console.error(`[Firebase DB] Error reading live telemetry for ${tankId}:`, error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Subscribe to historical records for a specific tank at /tanks/{tankId}/history.
 */
export function subscribeToTankHistory(tankId, onData, onError, limit = 50) {
  if (!db || !tankId) {
    if (onError) onError(new Error('Firebase Database or tankId is not provided.'));
    return () => {};
  }

  const historyRef = query(ref(db, `tanks/${tankId}/history`), limitToLast(limit));

  return onValue(
    historyRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData([]);
        return;
      }
      const historyList = [];
      snapshot.forEach((child) => {
        historyList.push({
          id: child.key,
          ...child.val()
        });
      });
      onData(historyList);
    },
    (error) => {
      console.error(`[Firebase DB] Error reading history for ${tankId}:`, error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Subscribe to alerts for a specific tank at /tanks/{tankId}/alerts.
 */
export function subscribeToTankAlerts(tankId, onData, onError, limit = 20) {
  if (!db || !tankId) {
    if (onError) onError(new Error('Firebase Database or tankId is not provided.'));
    return () => {};
  }

  const alertsRef = query(ref(db, `tanks/${tankId}/alerts`), limitToLast(limit));

  return onValue(
    alertsRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData([]);
        return;
      }
      const alertsList = [];
      snapshot.forEach((child) => {
        alertsList.push({
          id: child.key,
          ...child.val()
        });
      });
      onData(alertsList.reverse());
    },
    (error) => {
      console.error(`[Firebase DB] Error reading alerts for ${tankId}:`, error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Admin Fleet Overview: Subscribe to all tanks in /tanks.
 */
export function subscribeToAllTanks(onData, onError) {
  if (!db) {
    if (onError) onError(new Error('Database is not initialized.'));
    return () => {};
  }

  const tanksRef = ref(db, 'tanks');
  return onValue(
    tanksRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({});
        return;
      }
      onData(snapshot.val());
    },
    (error) => {
      console.error('[Firebase DB] Error reading tanks fleet:', error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Admin User Management: Subscribe to all user records in /users.
 */
export function subscribeToAllUsers(onData, onError) {
  if (!db) {
    if (onError) onError(new Error('Database is not initialized.'));
    return () => {};
  }

  const usersRef = ref(db, 'users');
  return onValue(
    usersRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({});
        return;
      }
      onData(snapshot.val());
    },
    (error) => {
      console.error('[Firebase DB] Error reading users directory:', error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Submit pump command to /tanks/{tankId}/commands.
 */
export async function submitTankCommand(tankId, { requestedMode, requestedPumpState }, currentUser, userProfile) {
  if (!db || !tankId) {
    throw new Error('Database or tank ID is not initialized.');
  }

  if (!currentUser || !currentUser.uid) {
    throw new Error('You must be signed in to submit commands.');
  }

  // Permission check: Admin can control any tank; Operator can only control their assigned tank
  const isAdmin = userProfile?.role === 'admin';
  const isAssignedOperator = userProfile?.role === 'operator' && userProfile?.assignedTankId === tankId;

  if (!isAdmin && !isAssignedOperator) {
    throw new Error(`Unauthorized: You are not assigned to manage tank '${tankId}'.`);
  }

  if (commandInFlight) {
    throw new Error('A command is already being processed. Please wait.');
  }

  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload = {
    requestedMode,
    requestedPumpState,
    commandId,
    requestedAt: Date.now(),
    requestedBy: currentUser.uid
  };

  const validation = validateCommandPayload(payload, currentUser.uid);
  if (!validation.valid) {
    throw new Error(`Command validation failed: ${validation.error}`);
  }

  commandInFlight = true;
  try {
    const commandsRef = ref(db, `tanks/${tankId}/commands`);
    await set(commandsRef, payload);
    console.log(`[Firebase DB] Command ${commandId} submitted successfully to tanks/${tankId}/commands.`);
    return { success: true, commandId, payload };
  } catch (error) {
    console.error(`[Firebase DB] Command submission failed:`, error.message);
    throw error;
  } finally {
    commandInFlight = false;
  }
}

/**
 * Subscribe to command acknowledgements at /tanks/{tankId}/commandAcks.
 */
export function subscribeToCommandAcks(tankId, onData, onError, limit = 10) {
  if (!db || !tankId) {
    if (onError) onError(new Error('Firebase Database or tankId is not provided.'));
    return () => {};
  }

  const acksRef = query(ref(db, `tanks/${tankId}/commandAcks`), limitToLast(limit));

  return onValue(
    acksRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({});
        return;
      }
      onData(snapshot.val());
    },
    (error) => {
      console.error(`[Firebase DB] Error reading command acks for ${tankId}:`, error.message);
      if (onError) onError(error);
    }
  );
}

/**
 * Record a command acknowledgement at /tanks/{tankId}/commandAcks/{commandId}.
 */
export async function recordCommandAck(tankId, commandId, { status, reason = '' }) {
  if (!db || !tankId || !commandId) {
    throw new Error('Database, tankId, and commandId are required.');
  }

  const ackRef = ref(db, `tanks/${tankId}/commandAcks/${commandId}`);
  const payload = {
    commandId,
    status, // 'RECEIVED' | 'APPLIED' | 'REJECTED' | 'FAILED'
    appliedAt: Date.now(),
    reason: String(reason || '')
  };

  await set(ackRef, payload);
  return payload;
}

