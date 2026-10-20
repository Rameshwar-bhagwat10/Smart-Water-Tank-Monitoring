/**
 * Smart Water Tank Monitoring System — Unit Test Suite
 * Stage G: Pump Controller State Machine & Safety Interlocks
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const SafetyLockout = {
  NONE: 'NONE',
  HIGH_LEVEL: 'HIGH_LEVEL',
  DRY_RUN: 'DRY_RUN',
  MAX_RUNTIME: 'MAX_RUNTIME',
  SENSOR_FAULT: 'SENSOR_FAULT'
};

const ControlMode = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL'
};

const PumpState = {
  OFF: 'OFF',
  ON: 'ON'
};

class SimulatedPumpController {
  constructor() {
    this.lowThreshold = 20.0;
    this.highThreshold = 95.0;
    this.maxRuntimeMs = 20 * 60 * 1000; // 20 min
    this.dryRunGraceMs = 5000;
    this.dryRunTripMs = 8000;
    this.relayActiveLow = true;

    this.reset();
  }

  reset() {
    this.mode = ControlMode.AUTO;
    this.pumpState = PumpState.OFF;
    this.relayPinState = this.relayActiveLow ? 1 : 0; // De-energized
    this.lockout = SafetyLockout.NONE;
    this.pumpStartMs = 0;
    this.dryRunDetectMs = 0;
  }

  setRelay(state) {
    this.pumpState = state;
    if (state === PumpState.ON) {
      this.relayPinState = this.relayActiveLow ? 0 : 1; // Energized
    } else {
      this.relayPinState = this.relayActiveLow ? 1 : 0; // De-energized
    }
  }

  setControlMode(newMode) {
    this.mode = newMode;
  }

  clearLockout() {
    this.lockout = SafetyLockout.NONE;
  }

  handleManualCommand(targetState) {
    if (this.mode !== ControlMode.MANUAL) {
      return { success: false, reason: 'NOT_IN_MANUAL_MODE' };
    }

    if (targetState === PumpState.ON) {
      if (this.lockout !== SafetyLockout.NONE) {
        return { success: false, reason: `SAFETY_LOCKOUT_${this.lockout}` };
      }
      this.setRelay(PumpState.ON);
      return { success: true };
    } else {
      this.setRelay(PumpState.OFF);
      return { success: true };
    }
  }

  update(nowMs, levelPercent, levelValid, flowRateLpm, pumpCurrentA) {
    // 1. Critical Sensor Fault Interlock
    if (!levelValid) {
      this.lockout = SafetyLockout.SENSOR_FAULT;
      this.setRelay(PumpState.OFF);
      return;
    }

    // 2. High Level Safety Cutoff (Highest priority hardware interlock)
    if (levelPercent >= this.highThreshold) {
      this.lockout = SafetyLockout.HIGH_LEVEL;
      this.setRelay(PumpState.OFF);
      return;
    } else if (this.lockout === SafetyLockout.HIGH_LEVEL && levelPercent < (this.highThreshold - 5.0)) {
      // Clear high level lockout once level drops by 5% hysteresis
      this.lockout = SafetyLockout.NONE;
    }

    // 3. Max Runtime Interlock
    if (this.pumpState === PumpState.ON) {
      if (this.pumpStartMs === 0) {
        this.pumpStartMs = nowMs;
      } else if (nowMs - this.pumpStartMs >= this.maxRuntimeMs) {
        this.lockout = SafetyLockout.MAX_RUNTIME;
        this.setRelay(PumpState.OFF);
        return;
      }
    } else {
      this.pumpStartMs = 0;
    }

    // 4. Dry-Run Detection Interlock
    if (this.pumpState === PumpState.ON) {
      const runningDuration = nowMs - this.pumpStartMs;
      if (runningDuration > this.dryRunGraceMs && flowRateLpm <= 0.1) {
        if (this.dryRunDetectMs === 0) {
          this.dryRunDetectMs = nowMs;
        } else if (nowMs - this.dryRunDetectMs >= this.dryRunTripMs) {
          this.lockout = SafetyLockout.DRY_RUN;
          this.setRelay(PumpState.OFF);
          return;
        }
      } else {
        this.dryRunDetectMs = 0;
      }
    } else {
      this.dryRunDetectMs = 0;
    }

    // 5. Automatic Mode Logic with Hysteresis
    if (this.mode === ControlMode.AUTO && this.lockout === SafetyLockout.NONE) {
      if (levelPercent <= this.lowThreshold && this.pumpState === PumpState.OFF) {
        this.setRelay(PumpState.ON);
        this.pumpStartMs = nowMs;
      }
    }
  }
}

describe('Pump Controller & Autonomous Safety Interlocks', () => {
  let ctrl;

  beforeEach(() => {
    ctrl = new SimulatedPumpController();
  });

  it('initializes with relay de-energized, mode AUTO, and pump OFF', () => {
    assert.strictEqual(ctrl.pumpState, PumpState.OFF);
    assert.strictEqual(ctrl.relayPinState, 1); // Active-low de-energized = HIGH
    assert.strictEqual(ctrl.mode, ControlMode.AUTO);
    assert.strictEqual(ctrl.lockout, SafetyLockout.NONE);
  });

  describe('Automatic Hysteresis Control (20% to 95%)', () => {
    it('turns pump ON when level falls to or below 20%', () => {
      ctrl.update(1000, 19.5, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);
      assert.strictEqual(ctrl.relayPinState, 0); // Energized
    });

    it('maintains pump ON while water level is rising between 20% and 95%', () => {
      ctrl.update(1000, 15.0, true, 0.0, 0.0); // Starts ON
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Level rises to 50%
      ctrl.update(2000, 50.0, true, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Level rises to 90%
      ctrl.update(3000, 90.0, true, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);
    });

    it('turns pump OFF immediately when water level reaches or exceeds 95%', () => {
      ctrl.update(1000, 15.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      ctrl.update(2000, 95.0, true, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.HIGH_LEVEL);
    });

    it('maintains pump OFF when water level drops from 95% down to 25% (hysteresis band)', () => {
      // Start at 96%
      ctrl.update(1000, 96.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);

      // Level drops to 80% (lockout clears once < 90%)
      ctrl.update(2000, 80.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);

      // Level drops to 25% (above 20% trigger)
      ctrl.update(3000, 25.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
    });
  });

  describe('Manual Mode & Cloud Command Safety Validation', () => {
    it('allows operator to turn pump ON and OFF in MANUAL mode within safe bounds', () => {
      ctrl.setControlMode(ControlMode.MANUAL);

      const onResult = ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(onResult.success, true);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      const offResult = ctrl.handleManualCommand(PumpState.OFF);
      assert.strictEqual(offResult.success, true);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
    });

    it('rejects manual ON command if tank level is at high cutoff (>=95%)', () => {
      ctrl.setControlMode(ControlMode.MANUAL);
      // Update with level >= 95%
      ctrl.update(1000, 96.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.lockout, SafetyLockout.HIGH_LEVEL);

      // Attempt manual ON
      const res = ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'SAFETY_LOCKOUT_HIGH_LEVEL');
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
    });

    it('overrides manual ON if water level hits 95% cutoff during running', () => {
      ctrl.setControlMode(ControlMode.MANUAL);
      ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Tank fills to 95.5% while running
      ctrl.update(2000, 95.5, true, 10.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.HIGH_LEVEL);
    });
  });

  describe('Autonomous Safety Interlocks: Sensor Fault, Max Runtime & Dry-Run', () => {
    it('turns pump OFF and locks out on sensor timeout/failure', () => {
      ctrl.update(1000, 15.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Ultrasonic sensor fails (levelValid = false)
      ctrl.update(2000, 0.0, false, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.SENSOR_FAULT);

      // Manual command is blocked
      ctrl.setControlMode(ControlMode.MANUAL);
      const res = ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(res.success, false);
    });

    it('trips MAX_RUNTIME lockout if pump runs continuously for > 20 minutes', () => {
      const startTime = 10000;
      ctrl.update(startTime, 15.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // 19 minutes elapsed with continuous flow
      ctrl.update(startTime + 19 * 60 * 1000, 40.0, true, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // 20 minutes and 1 second elapsed
      ctrl.update(startTime + 20 * 60 * 1000 + 1000, 45.0, true, 12.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.MAX_RUNTIME);
    });

    it('trips DRY_RUN lockout if zero flow is detected after startup grace period', () => {
      const startTime = 10000;
      ctrl.update(startTime, 15.0, true, 0.0, 0.0);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // 4 seconds elapsed (inside grace period) with 0 flow -> no trip yet
      ctrl.update(startTime + 4000, 15.0, true, 0.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // 6 seconds elapsed (grace expired, dry run detection window begins)
      ctrl.update(startTime + 6000, 15.0, true, 0.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // 15 seconds elapsed (9 seconds of sustained zero flow > 8 second trip threshold)
      ctrl.update(startTime + 15000, 15.0, true, 0.0, 2.5);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.DRY_RUN);
    });
  });
});
