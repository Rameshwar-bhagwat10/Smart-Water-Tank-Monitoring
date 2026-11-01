/**
 * Smart Water Tank - Strict TypeScript Type Definitions
 */

export type PumpState = 'ON' | 'OFF';
export type ControlMode = 'AUTO' | 'MANUAL';
export type SensorStatus = 'OK' | 'DEGRADED' | 'ERROR' | 'STANDBY';
export type ControllerState =
  | 'INITIALIZING'
  | 'IDLE'
  | 'AUTO_FILLING'
  | 'MANUAL_FILLING'
  | 'STOPPING'
  | 'SAFETY_LOCKOUT'
  | 'SENSOR_ERROR'
  | 'Standby'
  | 'Normal'
  | string;

export interface TelemetryData {
  levelPercent: number;
  distanceCm: number;
  flowRateLpm: number;
  totalLitres: number;
  pumpCurrentA: number;
  rawAdc?: number | string;
  pumpState: PumpState;
  controlMode: ControlMode;
  controllerStatus?: ControllerState;
  sensorStatus?: SensorStatus | string;
  faultCode?: string;
  waterProbe?: boolean;
  wifiConnected?: boolean;
  deviceIp?: string;
  ip?: string;
  updatedAt?: number;
  lastUpdatedTime?: string;
  ownerUid?: string;
  assignedUserEmail?: string;
}

export interface CommandPayload {
  commandId: string;
  requestedMode: ControlMode;
  requestedPumpState: PumpState;
  requestedAt: number;
  requestedBy: string;
  action?: string;
}

export interface CommandAck {
  status: 'PROCESSED' | 'REJECTED' | string;
  message: string;
  timestamp: number;
}

export interface UserProfile {
  email: string;
  assignedTankId: string;
  role: 'admin' | 'operator' | string;
  createdAt: number;
  lastLogin: number;
}

export interface ActivityEvent {
  msg: string;
  color: string;
  ts: string;
}
