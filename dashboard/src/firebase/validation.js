/**
 * Data contracts and schema validators for Firebase Realtime Database.
 */

export const ALLOWED_PUMP_STATES = Object.freeze(['ON', 'OFF', 'UNKNOWN']);
export const ALLOWED_CONTROL_MODES = Object.freeze(['AUTO', 'MANUAL']);
export const ALLOWED_COMMAND_FIELDS = Object.freeze([
  'requestedMode',
  'requestedPumpState',
  'commandId',
  'requestedAt',
  'requestedBy'
]);

/**
 * Validate incoming live telemetry from /devices/{deviceId}/live.
 * Returns sanitized object with valid types or nulls for missing/invalid fields.
 */
export function validateLiveTelemetry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const isValidNumber = (val, min = -Infinity, max = Infinity) =>
    typeof val === 'number' && !Number.isNaN(val) && val >= min && val <= max;

  return {
    levelPercent: isValidNumber(raw.levelPercent, 0, 100) ? Number(raw.levelPercent.toFixed(1)) : null,
    distanceCm: isValidNumber(raw.distanceCm, 0, 1000) ? Number(raw.distanceCm.toFixed(1)) : null,
    flowRateLpm: isValidNumber(raw.flowRateLpm, 0, 200) ? Number(raw.flowRateLpm.toFixed(1)) : null,
    totalLitres: isValidNumber(raw.totalLitres, 0) ? Number(raw.totalLitres.toFixed(1)) : null,
    pumpCurrentA: isValidNumber(raw.pumpCurrentA, 0, 50) ? Number(raw.pumpCurrentA.toFixed(2)) : null,
    pumpState: ALLOWED_PUMP_STATES.includes(raw.pumpState) ? raw.pumpState : 'UNKNOWN',
    controlMode: ALLOWED_CONTROL_MODES.includes(raw.controlMode) ? raw.controlMode : 'AUTO',
    sensorStatus: typeof raw.sensorStatus === 'string' && raw.sensorStatus.trim() ? raw.sensorStatus : 'UNKNOWN',
    wifiConnected: typeof raw.wifiConnected === 'boolean' ? raw.wifiConnected : false,
    updatedAt: isValidNumber(raw.updatedAt, 0) ? raw.updatedAt : null
  };
}

/**
 * Validates a command payload before submission to /devices/{deviceId}/commands.
 * Rejects extra fields, invalid types, or mismatched UIDs.
 */
export function validateCommandPayload(payload, currentUid) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Command payload must be an object' };
  }

  const keys = Object.keys(payload);
  const missing = ALLOWED_COMMAND_FIELDS.filter((f) => !keys.includes(f));
  if (missing.length > 0) {
    return { valid: false, error: `Missing required command field(s): ${missing.join(', ')}` };
  }

  const extra = keys.filter((k) => !ALLOWED_COMMAND_FIELDS.includes(k));
  if (extra.length > 0) {
    return { valid: false, error: `Unexpected field(s) rejected: ${extra.join(', ')}` };
  }

  if (!ALLOWED_CONTROL_MODES.includes(payload.requestedMode)) {
    return { valid: false, error: `Invalid requestedMode '${payload.requestedMode}'. Must be AUTO or MANUAL.` };
  }

  if (payload.requestedPumpState !== 'ON' && payload.requestedPumpState !== 'OFF') {
    return { valid: false, error: `Invalid requestedPumpState '${payload.requestedPumpState}'. Must be ON or OFF.` };
  }

  if (typeof payload.commandId !== 'string' || payload.commandId.trim().length === 0) {
    return { valid: false, error: 'commandId must be a non-empty string' };
  }

  if (payload.commandId.length > 64) {
    return { valid: false, error: 'commandId must not exceed 64 characters' };
  }

  if (typeof payload.requestedAt !== 'number' || payload.requestedAt < 0 || Number.isNaN(payload.requestedAt)) {
    return { valid: false, error: 'requestedAt must be a non-negative numeric timestamp' };
  }

  if (typeof payload.requestedBy !== 'string' || payload.requestedBy !== currentUid) {
    return { valid: false, error: 'requestedBy must match the authenticated user UID' };
  }

  return { valid: true, error: null };
}

/**
 * Check if telemetry data is considered stale based on a threshold (default: 60s).
 */
export function isTelemetryStale(updatedAt, thresholdMs = 60000) {
  if (!updatedAt || typeof updatedAt !== 'number') {
    return true;
  }
  return Date.now() - updatedAt > thresholdMs;
}
