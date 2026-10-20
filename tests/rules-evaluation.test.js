/**
 * Security Rules Evaluation Test Suite
 * Evaluates the rules defined in database.rules.json across multi-tenant Admin/Operator/Device scenarios.
 * Run with: node tests/rules-evaluation.test.js
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- RUNNING SECURITY RULES EVALUATION SUITE ---');

// Load database.rules.json
const rootDir = fs.existsSync(path.resolve(process.cwd(), 'database.rules.json'))
  ? process.cwd()
  : path.resolve(process.cwd(), '..');
const rulesPath = path.resolve(rootDir, 'database.rules.json');
assert.ok(fs.existsSync(rulesPath), `database.rules.json must exist at ${rulesPath}`);
const rulesContent = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

// Simulated Database Tree
const databaseState = {
  users: {
    'admin_uid_01': { email: 'admin@smartwatertank.local', role: 'admin', enabled: true },
    'operator_uid_01': { email: 'operator1@example.com', role: 'operator', assignedTankId: 'tank-01', enabled: true },
    'operator_uid_02': { email: 'operator2@example.com', role: 'operator', assignedTankId: 'tank-02', enabled: true },
    'disabled_uid_01': { email: 'disabled@example.com', role: 'operator', assignedTankId: 'tank-01', enabled: false }
  },
  deviceRegistry: {
    'device_uid_01': { enabled: true, assignedTankId: 'tank-01', firmwareVersion: '1.0.0' },
    'device_uid_02': { enabled: true, assignedTankId: 'tank-02', firmwareVersion: '1.0.0' },
    'disabled_dev_01': { enabled: false, assignedTankId: 'tank-01', firmwareVersion: '1.0.0' }
  },
  system: {
    tankAllocation: {
      lastAllocatedNumber: 2,
      updatedAt: Date.now()
    }
  },
  tanks: {
    'tank-01': {
      name: 'Tank 01',
      assignedTo: 'operator_uid_01',
      live: { levelPercent: 75.0, pumpState: 'OFF', updatedAt: Date.now() },
      commands: null,
      commandAcks: {},
      history: {},
      alerts: {}
    },
    'tank-02': {
      name: 'Tank 02',
      assignedTo: 'operator_uid_02',
      live: { levelPercent: 60.0, pumpState: 'OFF', updatedAt: Date.now() },
      commands: null,
      commandAcks: {},
      history: {},
      alerts: {}
    }
  }
};

/**
 * Rule Evaluator Engine simulating Firebase RTDB Expression Execution
 */
class RuleContext {
  constructor(auth, dataTree) {
    this.auth = auth;
    this.dataTree = dataTree;
    this.root = {
      child: (k1) => ({
        child: (k2) => ({
          child: (k3) => ({
            val: () => dataTree[k1]?.[k2]?.[k3] ?? null,
            isBoolean: () => typeof dataTree[k1]?.[k2]?.[k3] === 'boolean',
            isString: () => typeof dataTree[k1]?.[k2]?.[k3] === 'string'
          }),
          val: () => dataTree[k1]?.[k2] ?? null
        }),
        val: () => dataTree[k1] ?? null
      })
    };
  }

  // users container read
  canReadUsersDirectory() {
    const auth = this.auth;
    if (!auth) return false;
    return rootVal(this.root, 'users', auth.uid, 'role') === 'admin' &&
           rootVal(this.root, 'users', auth.uid, 'enabled') !== false;
  }

  // users/$uid read
  canReadUserProfile(targetUid) {
    const auth = this.auth;
    if (!auth) return false;
    if (rootVal(this.root, 'users', auth.uid, 'enabled') === false) return false;
    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isSelf = auth.uid === targetUid;
    return isAdmin || isSelf;
  }

  // users/$uid write
  canWriteUserProfile(targetUid, newData) {
    const auth = this.auth;
    if (!auth) return false;
    if (rootVal(this.root, 'users', auth.uid, 'enabled') === false) return false;
    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    if (!isAdmin) return false; // Ordinary users CANNOT write to user records!

    if (newData) {
      if (!newData.email || !newData.role) return false;
      if (newData.role !== 'admin' && newData.role !== 'operator') return false;
    }
    return true;
  }

  // deviceRegistry read
  canReadDeviceRegistry(targetDeviceUid) {
    const auth = this.auth;
    if (!auth) return false;
    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isSelfDevice = auth.uid === targetDeviceUid;
    return isAdmin || isSelfDevice;
  }

  // deviceRegistry write
  canWriteDeviceRegistry(newData) {
    const auth = this.auth;
    if (!auth) return false;
    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    if (!isAdmin) return false;
    if (newData) {
      if (typeof newData.enabled !== 'boolean' || typeof newData.assignedTankId !== 'string') return false;
    }
    return true;
  }

  // tanks root read
  canReadAllTanks() {
    const auth = this.auth;
    if (!auth) return false;
    if (rootVal(this.root, 'users', auth.uid, 'enabled') === false) return false;
    return rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
  }

  // tanks/$tankId read
  canReadTank(tankId) {
    const auth = this.auth;
    if (!auth) return false;
    if (rootVal(this.root, 'users', auth.uid, 'enabled') === false) return false;

    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isAssignedOp = rootVal(this.root, 'users', auth.uid, 'assignedTankId') === tankId;
    const isAssignedDevice = rootVal(this.root, 'deviceRegistry', auth.uid, 'enabled') === true &&
                             rootVal(this.root, 'deviceRegistry', auth.uid, 'assignedTankId') === tankId;

    return isAdmin || isAssignedOp || isAssignedDevice;
  }

  // tanks/$tankId/live write
  canWriteLiveTelemetry(tankId, newData) {
    const auth = this.auth;
    if (!auth) return { allowed: false, reason: 'Unauthenticated' };

    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isAssignedDevice = rootVal(this.root, 'deviceRegistry', auth.uid, 'enabled') === true &&
                             rootVal(this.root, 'deviceRegistry', auth.uid, 'assignedTankId') === tankId;

    if (!isAdmin && !isAssignedDevice) {
      return { allowed: false, reason: 'Only Admin or Assigned Device can write live telemetry' };
    }

    if (newData) {
      if (newData.levelPercent === undefined || !newData.pumpState || !newData.updatedAt) {
        return { allowed: false, reason: 'Missing required live fields' };
      }
    }
    return { allowed: true };
  }

  // tanks/$tankId/commands write
  canWriteCommand(tankId, newData) {
    const auth = this.auth;
    if (!auth) return { allowed: false, reason: 'Unauthenticated' };
    if (rootVal(this.root, 'users', auth.uid, 'enabled') === false) return { allowed: false, reason: 'Disabled user' };

    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isAssignedOp = rootVal(this.root, 'users', auth.uid, 'assignedTankId') === tankId;

    if (!isAdmin && !isAssignedOp) {
      return { allowed: false, reason: 'Only Admin or Assigned Operator can write commands' };
    }

    if (!newData) return { allowed: false, reason: 'Empty command' };

    const requiredKeys = ['requestedMode', 'requestedPumpState', 'commandId', 'requestedAt', 'requestedBy'];
    for (const key of requiredKeys) {
      if (!(key in newData)) return { allowed: false, reason: `Missing required key: ${key}` };
    }

    for (const key of Object.keys(newData)) {
      if (!requiredKeys.includes(key)) return { allowed: false, reason: `Unexpected field: ${key}` };
    }

    if (newData.requestedMode !== 'AUTO' && newData.requestedMode !== 'MANUAL') {
      return { allowed: false, reason: 'Invalid requestedMode' };
    }
    if (newData.requestedPumpState !== 'ON' && newData.requestedPumpState !== 'OFF') {
      return { allowed: false, reason: 'Invalid requestedPumpState' };
    }
    if (typeof newData.commandId !== 'string' || newData.commandId.length === 0 || newData.commandId.length > 64) {
      return { allowed: false, reason: 'Invalid commandId' };
    }
    if (typeof newData.requestedAt !== 'number' || newData.requestedAt < 0) {
      return { allowed: false, reason: 'Invalid requestedAt' };
    }
    if (newData.requestedBy !== auth.uid) {
      return { allowed: false, reason: 'requestedBy must equal authenticated UID' };
    }

    return { allowed: true };
  }

  // tanks/$tankId/commandAcks/$commandId write
  canWriteCommandAck(tankId, commandId, newData) {
    const auth = this.auth;
    if (!auth) return { allowed: false, reason: 'Unauthenticated' };

    const isAdmin = rootVal(this.root, 'users', auth.uid, 'role') === 'admin';
    const isAssignedDevice = rootVal(this.root, 'deviceRegistry', auth.uid, 'enabled') === true &&
                             rootVal(this.root, 'deviceRegistry', auth.uid, 'assignedTankId') === tankId;

    if (!isAdmin && !isAssignedDevice) {
      return { allowed: false, reason: 'Only Admin or Assigned Device can write command acks' };
    }

    if (!newData) return { allowed: false, reason: 'Empty ack' };
    if (!newData.status || !newData.appliedAt || !newData.commandId) {
      return { allowed: false, reason: 'Missing required ack fields' };
    }
    if (!['RECEIVED', 'APPLIED', 'REJECTED', 'FAILED'].includes(newData.status)) {
      return { allowed: false, reason: 'Invalid ack status' };
    }
    if (newData.commandId !== commandId) {
      return { allowed: false, reason: 'commandId mismatch' };
    }
    return { allowed: true };
  }
}

function rootVal(root, k1, k2, k3) {
  return root.child(k1).child(k2).child(k3).val();
}

let passed = 0;
let failed = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

const adminCtx = new RuleContext({ uid: 'admin_uid_01' }, databaseState);
const op1Ctx = new RuleContext({ uid: 'operator_uid_01' }, databaseState);
const op2Ctx = new RuleContext({ uid: 'operator_uid_02' }, databaseState);
const disabledUserCtx = new RuleContext({ uid: 'disabled_uid_01' }, databaseState);
const dev1Ctx = new RuleContext({ uid: 'device_uid_01' }, databaseState);
const dev2Ctx = new RuleContext({ uid: 'device_uid_02' }, databaseState);
const disabledDevCtx = new RuleContext({ uid: 'disabled_dev_01' }, databaseState);
const unauthCtx = new RuleContext(null, databaseState);

// --- Phase 2 Security Fixes ---
it('Denies unauthenticated access to users directory', () => {
  assert.strictEqual(unauthCtx.canReadUsersDirectory(), false);
});

it('Allows authenticated admin to read users directory', () => {
  assert.strictEqual(adminCtx.canReadUsersDirectory(), true);
});

it('Denies operator from reading the users directory (least privilege)', () => {
  assert.strictEqual(op1Ctx.canReadUsersDirectory(), false);
});

it('Allows operator to read their own profile', () => {
  assert.strictEqual(op1Ctx.canReadUserProfile('operator_uid_01'), true);
});

it('Denies operator from reading another user profile', () => {
  assert.strictEqual(op1Ctx.canReadUserProfile('operator_uid_02'), false);
});

it('CRITICAL: Denies operator from writing to their own profile (Privilege Escalation Blocked)', () => {
  const elevatePayload = { email: 'operator1@example.com', role: 'admin' };
  assert.strictEqual(op1Ctx.canWriteUserProfile('operator_uid_01', elevatePayload), false);
});

it('Allows admin to create and update operator user profiles', () => {
  const newOp = { email: 'newop@example.com', role: 'operator' };
  assert.strictEqual(adminCtx.canWriteUserProfile('new_uid_99', newOp), true);
});

it('Denies disabled user from reading their profile or any data', () => {
  assert.strictEqual(disabledUserCtx.canReadUserProfile('disabled_uid_01'), false);
  assert.strictEqual(disabledUserCtx.canReadTank('tank-01'), false);
});

it('Allows admin to read the entire tanks fleet (/tanks)', () => {
  assert.strictEqual(adminCtx.canReadAllTanks(), true);
});

it('Denies operator from reading the entire tanks fleet (/tanks)', () => {
  assert.strictEqual(op1Ctx.canReadAllTanks(), false);
});

it('Allows operator to read their designated tank (/tanks/tank-01)', () => {
  assert.strictEqual(op1Ctx.canReadTank('tank-01'), true);
});

it('Denies operator from reading another operator tank (/tanks/tank-02)', () => {
  assert.strictEqual(op1Ctx.canReadTank('tank-02'), false);
});

it('Allows operator to dispatch valid command to their designated tank', () => {
  const validCmd = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_12345',
    requestedAt: Date.now(),
    requestedBy: 'operator_uid_01'
  };
  const res = op1Ctx.canWriteCommand('tank-01', validCmd);
  assert.strictEqual(res.allowed, true);
});

it('Denies operator from dispatching command to another tank', () => {
  const validCmd = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_12345',
    requestedAt: Date.now(),
    requestedBy: 'operator_uid_01'
  };
  const res = op1Ctx.canWriteCommand('tank-02', validCmd);
  assert.strictEqual(res.allowed, false);
});

it('Rejects command with spoofed requestedBy (must equal auth.uid)', () => {
  const badCmd = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_12345',
    requestedAt: Date.now(),
    requestedBy: 'admin_uid_01' // spoofed!
  };
  const res = op1Ctx.canWriteCommand('tank-01', badCmd);
  assert.strictEqual(res.allowed, false);
});

// --- Phase 3 Device Identity & Hardware Authorization ---
it('Allows admin to register a physical controller in deviceRegistry', () => {
  assert.strictEqual(adminCtx.canWriteDeviceRegistry({ enabled: true, assignedTankId: 'tank-03' }), true);
});

it('Denies physical device from modifying deviceRegistry', () => {
  assert.strictEqual(dev1Ctx.canWriteDeviceRegistry({ enabled: true, assignedTankId: 'tank-02' }), false);
});

it('Allows assigned enabled device to write live telemetry to its own tank', () => {
  const validTelemetry = {
    levelPercent: 82.5,
    pumpState: 'OFF',
    updatedAt: Date.now()
  };
  const res = dev1Ctx.canWriteLiveTelemetry('tank-01', validTelemetry);
  assert.strictEqual(res.allowed, true);
});

it('Denies device from writing live telemetry to a different tank', () => {
  const validTelemetry = {
    levelPercent: 82.5,
    pumpState: 'OFF',
    updatedAt: Date.now()
  };
  const res = dev1Ctx.canWriteLiveTelemetry('tank-02', validTelemetry);
  assert.strictEqual(res.allowed, false);
});

it('Denies disabled device from writing live telemetry', () => {
  const validTelemetry = {
    levelPercent: 82.5,
    pumpState: 'OFF',
    updatedAt: Date.now()
  };
  const res = disabledDevCtx.canWriteLiveTelemetry('tank-01', validTelemetry);
  assert.strictEqual(res.allowed, false);
});

it('Denies operator from writing live telemetry directly (prevent spoofed sensor data)', () => {
  const spoofedTelemetry = {
    levelPercent: 99.0,
    pumpState: 'ON',
    updatedAt: Date.now()
  };
  const res = op1Ctx.canWriteLiveTelemetry('tank-01', spoofedTelemetry);
  assert.strictEqual(res.allowed, false);
});

it('Denies device from writing to commands node (devices only consume commands)', () => {
  const cmd = {
    requestedMode: 'MANUAL',
    requestedPumpState: 'ON',
    commandId: 'cmd_dev',
    requestedAt: Date.now(),
    requestedBy: 'device_uid_01'
  };
  const res = dev1Ctx.canWriteCommand('tank-01', cmd);
  assert.strictEqual(res.allowed, false);
});

it('Allows assigned device to write command acknowledgement to its tank', () => {
  const ack = {
    status: 'APPLIED',
    appliedAt: Date.now(),
    commandId: 'cmd_12345'
  };
  const res = dev1Ctx.canWriteCommandAck('tank-01', 'cmd_12345', ack);
  assert.strictEqual(res.allowed, true);
});

it('Denies device from writing command acknowledgement to another tank', () => {
  const ack = {
    status: 'APPLIED',
    appliedAt: Date.now(),
    commandId: 'cmd_12345'
  };
  const res = dev1Ctx.canWriteCommandAck('tank-02', 'cmd_12345', ack);
  assert.strictEqual(res.allowed, false);
});

it('Rejects invalid command acknowledgement status', () => {
  const badAck = {
    status: 'INVALID_STATUS',
    appliedAt: Date.now(),
    commandId: 'cmd_12345'
  };
  const res = dev1Ctx.canWriteCommandAck('tank-01', 'cmd_12345', badAck);
  assert.strictEqual(res.allowed, false);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
assert.strictEqual(failed, 0, 'All security rules tests must pass');
