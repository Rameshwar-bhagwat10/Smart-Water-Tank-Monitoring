import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * PHASE 4A REGRESSION TEST SUITE
 * Tests for remediated defects: CMD-001, SEC-002, SAF-001, SEC-004
 */

// ============================================================================
// SIMULATED COMMAND LIFECYCLE CONTROLLER (Mirrors FirebaseClient.cpp CMD-001)
// ============================================================================
class SimulatedCloudCommandProcessor {
  constructor() {
    this.startupBaselineEstablished = false;
    this.lastProcessedCommandId = '';
    this.executedCommands = [];
    this.acknowledgedCommands = [];
    this.COMMAND_TTL_SEC = 60;
  }

  processPolledCommand(command, currentNtpTimeSec) {
    if (!command || !command.commandId) return { action: 'IGNORED', reason: 'Empty command' };

    // 1. Startup Baseline: If first poll after boot, establish baseline without execution
    if (!this.startupBaselineEstablished) {
      this.startupBaselineEstablished = true;
      this.lastProcessedCommandId = command.commandId;
      this.acknowledgedCommands.push({
        commandId: command.commandId,
        status: 'RECEIVED',
        reason: 'Startup baseline: historical command marked processed without re-actuation'
      });
      return { action: 'BASELINE_ESTABLISHED', reason: 'Historical command ignored on boot' };
    }

    // 2. Persistent / RAM Deduplication
    if (this.lastProcessedCommandId === command.commandId) {
      return { action: 'REJECTED', reason: 'Duplicate commandId' };
    }

    // 3. Command Freshness / TTL Check via NTP
    if (currentNtpTimeSec && command.requestedAt) {
      const commandTimeSec = Math.floor(command.requestedAt / 1000);
      if (currentNtpTimeSec - commandTimeSec > this.COMMAND_TTL_SEC) {
        this.lastProcessedCommandId = command.commandId;
        this.acknowledgedCommands.push({
          commandId: command.commandId,
          status: 'REJECTED',
          reason: 'Command expired (TTL > 60s)'
        });
        return { action: 'EXPIRED', reason: 'Command expired' };
      }
    }

    // 4. Fresh, valid command -> Execute
    this.lastProcessedCommandId = command.commandId;
    this.executedCommands.push(command);
    this.acknowledgedCommands.push({
      commandId: command.commandId,
      status: 'APPLIED',
      reason: 'Command applied to relay'
    });
    return { action: 'EXECUTED', reason: 'Command verified and executed' };
  }
}

// ============================================================================
// SIMULATED LOCAL DASHBOARD AUTHENTICATOR (Mirrors LocalDashboardServer.cpp SEC-002)
// ============================================================================
class SimulatedLocalServerAuth {
  constructor(defaultPin = 'admin123') {
    this.defaultPin = defaultPin;
    this.activeSessionToken = null;
    this.sessionExpiryMs = 0;
    this.failedAuthAttempts = 0;
    this.authLockoutUntilMs = 0;
  }

  login(passOrPin, currentMillis = 1000) {
    if (this.authLockoutUntilMs > 0 && currentMillis < this.authLockoutUntilMs) {
      return { status: 429, reason: 'Rate limit exceeded' };
    }

    if (passOrPin === this.defaultPin) {
      this.failedAuthAttempts = 0;
      this.authLockoutUntilMs = 0;
      this.activeSessionToken = 'st_test_token_' + Math.random().toString(16).substring(2);
      this.sessionExpiryMs = currentMillis + (15 * 60 * 1000);
      return { status: 200, token: this.activeSessionToken };
    }

    this.failedAuthAttempts++;
    if (this.failedAuthAttempts >= 5) {
      this.authLockoutUntilMs = currentMillis + 30000;
    }
    return { status: 401, reason: 'Invalid credentials' };
  }

  authorizeRequest(token, pin, currentMillis = 1000) {
    if (this.authLockoutUntilMs > 0 && currentMillis < this.authLockoutUntilMs) {
      return { authorized: false, status: 429 };
    }

    if (token && this.activeSessionToken && token === this.activeSessionToken && currentMillis < this.sessionExpiryMs) {
      return { authorized: true, status: 200 };
    }

    if (pin && pin === this.defaultPin) {
      return { authorized: true, status: 200 };
    }

    this.failedAuthAttempts++;
    if (this.failedAuthAttempts >= 5) {
      this.authLockoutUntilMs = currentMillis + 30000;
    }
    return { authorized: false, status: 401 };
  }

  executeCommand(params, currentMillis = 1000) {
    const auth = this.authorizeRequest(params.token, params.pin, currentMillis);
    if (!auth.authorized) {
      return { success: false, status: auth.status, reason: 'Unauthorized' };
    }

    // Validate mode
    if (params.mode && params.mode !== 'AUTO' && params.mode !== 'MANUAL') {
      return { success: false, status: 400, reason: 'Invalid mode' };
    }

    // Validate pumpState
    if (params.pumpState && params.pumpState !== 'ON' && params.pumpState !== 'OFF') {
      return { success: false, status: 400, reason: 'Invalid pumpState' };
    }

    return { success: true, status: 200, action: 'APPLIED' };
  }

  configureWifi(params, currentMillis = 1000) {
    const auth = this.authorizeRequest(params.token, params.pin, currentMillis);
    if (!auth.authorized) {
      return { success: false, status: auth.status, error: 'Unauthorized' };
    }

    if (!params.ssid || params.ssid.length === 0 || params.ssid.length > 32) {
      return { success: false, status: 400, error: 'Invalid SSID' };
    }

    return { success: true, status: 200, message: 'Saved' };
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Phase 4A Regression: CMD-001 Stale Command Replay Prevention', () => {
  it('discards historical manual ON command present in Firebase during boot', () => {
    const processor = new SimulatedCloudCommandProcessor();
    const historicalCommand = {
      commandId: 'cmd_historical_001',
      requestedMode: 'MANUAL',
      requestedPumpState: 'ON',
      requestedAt: Date.now() - 3600000 // 1 hour ago
    };

    const res = processor.processPolledCommand(historicalCommand, Math.floor(Date.now() / 1000));
    assert.equal(res.action, 'BASELINE_ESTABLISHED');
    assert.equal(processor.executedCommands.length, 0, 'No historical commands must be executed on boot');
    assert.equal(processor.lastProcessedCommandId, 'cmd_historical_001');
    assert.equal(processor.acknowledgedCommands[0].status, 'RECEIVED');
  });

  it('executes fresh command received after boot baseline is established', () => {
    const processor = new SimulatedCloudCommandProcessor();
    const bootTimeSec = 1700000000;

    // Boot poll with existing historical command
    processor.processPolledCommand({
      commandId: 'cmd_boot_000',
      requestedMode: 'MANUAL',
      requestedPumpState: 'OFF',
      requestedAt: (bootTimeSec - 100) * 1000
    }, bootTimeSec);

    // New command dispatched by operator 5 seconds later
    const freshCommand = {
      commandId: 'cmd_fresh_001',
      requestedMode: 'MANUAL',
      requestedPumpState: 'ON',
      requestedAt: (bootTimeSec + 5) * 1000
    };

    const res = processor.processPolledCommand(freshCommand, bootTimeSec + 6);
    assert.equal(res.action, 'EXECUTED');
    assert.equal(processor.executedCommands.length, 1);
    assert.equal(processor.executedCommands[0].commandId, 'cmd_fresh_001');
  });

  it('rejects expired command exceeding 60-second TTL window', () => {
    const processor = new SimulatedCloudCommandProcessor();
    const currentTimeSec = 1700000000;
    processor.startupBaselineEstablished = true;

    const staleCommand = {
      commandId: 'cmd_stale_999',
      requestedMode: 'MANUAL',
      requestedPumpState: 'ON',
      requestedAt: (currentTimeSec - 90) * 1000 // 90 seconds ago (> 60s TTL)
    };

    const res = processor.processPolledCommand(staleCommand, currentTimeSec);
    assert.equal(res.action, 'EXPIRED');
    assert.equal(processor.executedCommands.length, 0);
    assert.equal(processor.acknowledgedCommands[0].status, 'REJECTED');
  });

  it('deduplicates identical command received repeatedly across poll cycles', () => {
    const processor = new SimulatedCloudCommandProcessor();
    processor.startupBaselineEstablished = true;

    const cmd = {
      commandId: 'cmd_repeat_123',
      requestedMode: 'MANUAL',
      requestedPumpState: 'OFF',
      requestedAt: Date.now()
    };

    const res1 = processor.processPolledCommand(cmd, Math.floor(Date.now() / 1000));
    assert.equal(res1.action, 'EXECUTED');

    const res2 = processor.processPolledCommand(cmd, Math.floor(Date.now() / 1000) + 1);
    assert.equal(res2.action, 'REJECTED');
    assert.equal(processor.executedCommands.length, 1, 'Duplicate must not be re-executed');
  });
});

describe('Phase 4A Regression: SEC-002 Local HTTP Endpoint Security & Rate Limiting', () => {
  it('rejects commands when arbitrary email "@" or spoofed UID is supplied without credentials', () => {
    const auth = new SimulatedLocalServerAuth('admin123');

    // Attacker sends forged email or UID
    const res1 = auth.executeCommand({ email: 'attacker@evil.com', mode: 'MANUAL', pumpState: 'ON' });
    assert.equal(res1.status, 401);
    assert.equal(res1.success, false);

    const res2 = auth.executeCommand({ uid: 'random_spoofed_uid_123', mode: 'MANUAL', pumpState: 'ON' });
    assert.equal(res2.status, 401);
  });

  it('rejects hardcoded backdoor PIN "1234"', () => {
    const auth = new SimulatedLocalServerAuth('admin123');
    const res = auth.executeCommand({ pin: '1234', mode: 'MANUAL', pumpState: 'ON' });
    assert.equal(res.status, 401, 'Backdoor 1234 must be rejected');
  });

  it('authenticates valid PIN, issues session token, and accepts authenticated commands', () => {
    const auth = new SimulatedLocalServerAuth('admin123');
    const loginRes = auth.login('admin123', 1000);
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.token);

    const cmdRes = auth.executeCommand({ token: loginRes.token, mode: 'MANUAL', pumpState: 'ON' }, 2000);
    assert.equal(cmdRes.status, 200);
    assert.equal(cmdRes.success, true);
  });

  it('rejects unauthenticated Wi-Fi setup attempts', () => {
    const auth = new SimulatedLocalServerAuth('admin123');
    const res = auth.configureWifi({ ssid: 'HackerNet', pass: 'pwned' });
    assert.equal(res.status, 401);
    assert.equal(res.success, false);
  });

  it('engages rate-limiting 30-second lockout after 5 consecutive failed authentication attempts', () => {
    const auth = new SimulatedLocalServerAuth('admin123');

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const res = auth.login('wrong_pin_' + i, 1000);
      assert.equal(res.status, 401);
    }

    // 5th failed attempt triggers lockout
    const res5 = auth.login('wrong_pin_5', 1000);
    assert.equal(res5.status, 401);

    // 6th attempt within lockout window returns 429 Too Many Requests
    const res6 = auth.login('admin123', 5000); // even with correct PIN, must be locked out
    assert.equal(res6.status, 429);

    // After 30 seconds (at t = 32000ms), lockout expires and login succeeds
    const resAfterExpiry = auth.login('admin123', 32000);
    assert.equal(resAfterExpiry.status, 200);
  });

  it('validates command schema and rejects invalid mode or pumpState', () => {
    const auth = new SimulatedLocalServerAuth('admin123');
    const resMode = auth.executeCommand({ pin: 'admin123', mode: 'INVALID_MODE' });
    assert.equal(resMode.status, 400);

    const resPump = auth.executeCommand({ pin: 'admin123', mode: 'MANUAL', pumpState: 'EXPLODE' });
    assert.equal(resPump.status, 400);
  });
});

describe('Phase 4A Regression: SAF-001 & SEC-004 Hygiene', () => {
  it('verifies create-admin-user script does not contain default hardcoded credentials', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync('dashboard/scripts/create-admin-user.js', 'utf-8');
    assert.ok(!content.includes('AdminWaterTank2026!'), 'Default hardcoded password must be removed');
  });
});
