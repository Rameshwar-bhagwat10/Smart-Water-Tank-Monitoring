/**
 * Unit tests for Dashboard Validation and Contract Logic
 * Run with: node tests/dashboard-unit.test.js
 */

import assert from 'node:assert';
import {
  validateLiveTelemetry,
  validateCommandPayload,
  isTelemetryStale,
  ALLOWED_PUMP_STATES,
  ALLOWED_CONTROL_MODES
} from '../dashboard/src/firebase/validation.js';

console.log('--- RUNNING DASHBOARD UNIT & CONTRACT TESTS ---');

let passed = 0;
let failed = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${description}`);
    console.error(`    Error: ${error.message}`);
    failed++;
  }
}

// 1. Live Telemetry Validation Tests
it('validates complete valid live telemetry payload', () => {
  const raw = {
    levelPercent: 78.43,
    distanceCm: 22.19,
    flowRateLpm: 12.55,
    totalLitres: 1450.2,
    pumpCurrentA: 2.812,
    pumpState: 'ON',
    controlMode: 'AUTO',
    sensorStatus: 'OK',
    wifiConnected: true,
    updatedAt: Date.now()
  };

  const validated = validateLiveTelemetry(raw);
  assert.strictEqual(validated.levelPercent, 78.4);
  assert.strictEqual(validated.distanceCm, 22.2);
  assert.strictEqual(validated.flowRateLpm, 12.6);
  assert.strictEqual(validated.totalLitres, 1450.2);
  assert.strictEqual(validated.pumpCurrentA, 2.81);
  assert.strictEqual(validated.pumpState, 'ON');
  assert.strictEqual(validated.controlMode, 'AUTO');
  assert.strictEqual(validated.sensorStatus, 'OK');
  assert.strictEqual(validated.wifiConnected, true);
  assert.ok(typeof validated.updatedAt === 'number');
});

it('handles uninitialized or null telemetry fields gracefully (honest empty state)', () => {
  const uninitialized = {
    levelPercent: null,
    distanceCm: null,
    flowRateLpm: null,
    totalLitres: 0.0,
    pumpCurrentA: null,
    pumpState: 'UNKNOWN',
    controlMode: 'AUTO',
    sensorStatus: 'UNKNOWN',
    wifiConnected: false,
    updatedAt: null
  };

  const validated = validateLiveTelemetry(uninitialized);
  assert.strictEqual(validated.levelPercent, null);
  assert.strictEqual(validated.distanceCm, null);
  assert.strictEqual(validated.flowRateLpm, null);
  assert.strictEqual(validated.totalLitres, 0.0);
  assert.strictEqual(validated.pumpCurrentA, null);
  assert.strictEqual(validated.pumpState, 'UNKNOWN');
  assert.strictEqual(validated.sensorStatus, 'UNKNOWN');
  assert.strictEqual(validated.wifiConnected, false);
  assert.strictEqual(validated.updatedAt, null);
});

it('rejects out-of-range sensor readings by setting them to null', () => {
  const corrupt = {
    levelPercent: 120.5, // > 100
    distanceCm: -5.0,    // < 0
    flowRateLpm: -1.0,   // < 0
    pumpState: 'INVALID_STATE',
    controlMode: 'INVALID_MODE',
    sensorStatus: '',
    wifiConnected: 'yes' // not boolean
  };

  const validated = validateLiveTelemetry(corrupt);
  assert.strictEqual(validated.levelPercent, null);
  assert.strictEqual(validated.distanceCm, null);
  assert.strictEqual(validated.flowRateLpm, null);
  assert.strictEqual(validated.pumpState, 'UNKNOWN');
  assert.strictEqual(validated.controlMode, 'AUTO');
  assert.strictEqual(validated.sensorStatus, 'UNKNOWN');
  assert.strictEqual(validated.wifiConnected, false);
});

it('detects stale telemetry correctly based on threshold', () => {
  const now = Date.now();
  assert.strictEqual(isTelemetryStale(now - 10000, 60000), false); // 10s old < 60s
  assert.strictEqual(isTelemetryStale(now - 75000, 60000), true);  // 75s old > 60s
  assert.strictEqual(isTelemetryStale(null, 60000), true);         // null is stale
});

// 2. Command Validation Tests
it('accepts a valid complete command payload from authorized user', () => {
  const payload = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_1718000000_abc123',
    requestedAt: Date.now(),
    requestedBy: 'user_admin_01'
  };

  const result = validateCommandPayload(payload, 'user_admin_01');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.error, null);
});

it('rejects command with invalid requestedMode', () => {
  const payload = {
    requestedMode: 'OVERRIDE', // invalid
    requestedPumpState: 'ON',
    commandId: 'cmd_1',
    requestedAt: Date.now(),
    requestedBy: 'user_admin_01'
  };

  const result = validateCommandPayload(payload, 'user_admin_01');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('Invalid requestedMode'));
});

it('rejects command with invalid requestedPumpState', () => {
  const payload = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'RUNNING', // invalid
    commandId: 'cmd_1',
    requestedAt: Date.now(),
    requestedBy: 'user_admin_01'
  };

  const result = validateCommandPayload(payload, 'user_admin_01');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('Invalid requestedPumpState'));
});

it('rejects command missing required fields', () => {
  const payload = {
    requestedMode: 'AUTO',
    requestedPumpState: 'OFF'
    // missing commandId, requestedAt, requestedBy
  };

  const result = validateCommandPayload(payload, 'user_admin_01');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('Missing required command field'));
});

it('rejects command containing unexpected extra fields (strict contract enforcement)', () => {
  const payload = {
    requestedMode: 'AUTO',
    requestedPumpState: 'OFF',
    commandId: 'cmd_1',
    requestedAt: Date.now(),
    requestedBy: 'user_admin_01',
    bypassSafety: true // UNEXPECTED FIELD
  };

  const result = validateCommandPayload(payload, 'user_admin_01');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('Unexpected field(s) rejected: bypassSafety'));
});

it('rejects command when requestedBy does not match authenticated user UID', () => {
  const payload = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_1',
    requestedAt: Date.now(),
    requestedBy: 'impostor_uid'
  };

  const result = validateCommandPayload(payload, 'actual_authenticated_uid');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('requestedBy must match'));
});

it('rejects excessively long command IDs (> 64 chars)', () => {
  const payload = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'a'.repeat(65),
    requestedAt: Date.now(),
    requestedBy: 'user_01'
  };

  const result = validateCommandPayload(payload, 'user_01');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error.includes('must not exceed 64 characters'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
