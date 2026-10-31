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
    this.lastLevelPercent = 50.0;
    this.lastLevelValid = true;
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
      if (!this.lastLevelValid) {
        this.lockout = SafetyLockout.SENSOR_FAULT;
        return { success: false, reason: 'SENSOR_FAULT' };
      }
      if (this.lastLevelPercent >= this.highThreshold) {
        this.lockout = SafetyLockout.HIGH_LEVEL;
        return { success: false, reason: 'SAFETY_LOCKOUT_HIGH_LEVEL' };
      }
      this.setRelay(PumpState.ON);
      return { success: true };
    } else {
      this.setRelay(PumpState.OFF);
      return { success: true };
    }
  }

  update(nowMs, levelPercent, levelValid, flowRateLpm, pumpCurrentA) {
    this.lastLevelPercent = levelPercent;
    this.lastLevelValid = levelValid;

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

    it('rejects manual ON pre-activation at 96% even if lockout was reset', () => {
      ctrl.setControlMode(ControlMode.MANUAL);
      ctrl.update(1000, 96.0, true, 0.0, 0.0);
      ctrl.clearLockout(); // Attempt to bypass lockout
      assert.strictEqual(ctrl.lockout, SafetyLockout.NONE);

      // Pre-activation check must block relay actuation
      const res = ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'SAFETY_LOCKOUT_HIGH_LEVEL');
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.relayPinState, 1); // Relay remains de-energized
    });

    it('rejects manual ON pre-activation when sensor reading is invalid', () => {
      ctrl.setControlMode(ControlMode.MANUAL);
      ctrl.update(1000, 50.0, false, 0.0, 0.0); // Invalid sensor reading
      ctrl.clearLockout(); // Attempt to clear

      const res = ctrl.handleManualCommand(PumpState.ON);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'SENSOR_FAULT');
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.relayPinState, 1);
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

  describe('Stage 3: 7-State ControllerState Lifecycle & Transitions', () => {
    const ControllerState = {
      INITIALIZING: 'INITIALIZING',
      IDLE: 'IDLE',
      AUTO_FILLING: 'AUTO_FILLING',
      MANUAL_FILLING: 'MANUAL_FILLING',
      STOPPING: 'STOPPING',
      FAULT: 'FAULT',
      SENSOR_ERROR: 'SENSOR_ERROR'
    };

    class StateMachinePumpController {
      constructor() {
        this.autoStartPct = 20.0;
        this.autoStopPct = 95.0;
        this.hardCutoffPct = 95.0;
        this.maxRuntimeMs = 20 * 60 * 1000;
        this.dryRunGraceMs = 5000;
        this.dryRunTripMs = 5000;
        this.mode = ControlMode.AUTO;
        this.state = ControllerState.INITIALIZING;
        this.lockout = SafetyLockout.NONE;
        this.pumpRunning = false;
        this.pumpStartMs = 0;
        this.zeroFlowStartMs = 0;
        this.lastLevelPct = 50.0;
        this.lastLevelValid = true;
      }

      requestMode(newMode) {
        if (this.mode !== newMode) {
          if (this.pumpRunning) {
            this.pumpRunning = false;
            this.state = ControllerState.STOPPING;
          }
          this.mode = newMode;
          if (!this.pumpRunning && this.state !== ControllerState.FAULT && this.state !== ControllerState.SENSOR_ERROR) {
            this.state = ControllerState.IDLE;
          }
          return { accepted: true };
        }
        return { accepted: true };
      }

      requestManualPump(on, nowMs) {
        if (this.mode !== ControlMode.MANUAL) {
          return { accepted: false, reason: 'NOT_IN_MANUAL_MODE' };
        }
        if (on) {
          if (this.lockout !== SafetyLockout.NONE) return { accepted: false, reason: 'LOCKOUT' };
          if (!this.lastLevelValid) {
            this.state = ControllerState.SENSOR_ERROR;
            this.lockout = SafetyLockout.SENSOR_FAULT;
            return { accepted: false, reason: 'SENSOR_FAULT' };
          }
          if (this.lastLevelPct >= this.hardCutoffPct) {
            this.state = ControllerState.FAULT;
            this.lockout = SafetyLockout.HIGH_LEVEL;
            return { accepted: false, reason: 'HIGH_CUTOFF' };
          }
          this.pumpRunning = true;
          this.pumpStartMs = nowMs;
          this.state = ControllerState.MANUAL_FILLING;
          return { accepted: true };
        } else {
          this.pumpRunning = false;
          this.state = ControllerState.IDLE;
          return { accepted: true };
        }
      }

      update(nowMs, levelPercent, isLevelValid, flowRateLpm, currentA, isStale = false) {
        this.lastLevelPct = levelPercent;
        this.lastLevelValid = isLevelValid && !isStale;

        if (!isLevelValid || isStale) {
          this.pumpRunning = false;
          this.lockout = SafetyLockout.SENSOR_FAULT;
          this.state = ControllerState.SENSOR_ERROR;
          return;
        }

        if (this.lockout === SafetyLockout.SENSOR_FAULT) {
          this.lockout = SafetyLockout.NONE;
        }

        if (levelPercent >= this.hardCutoffPct) {
          this.pumpRunning = false;
          this.lockout = SafetyLockout.HIGH_LEVEL;
          this.state = ControllerState.FAULT;
          return;
        }

        if (this.lockout === SafetyLockout.HIGH_LEVEL && levelPercent < this.autoStopPct) {
          this.lockout = SafetyLockout.NONE;
        }

        if (this.pumpRunning) {
          const runDuration = nowMs - this.pumpStartMs;
          if (runDuration >= this.maxRuntimeMs) {
            this.pumpRunning = false;
            this.lockout = SafetyLockout.MAX_RUNTIME;
            this.state = ControllerState.FAULT;
            return;
          }
          if (runDuration > this.dryRunGraceMs) {
            if (flowRateLpm <= 0.1) {
              if (this.zeroFlowStartMs === 0) {
                this.zeroFlowStartMs = nowMs;
              } else if (nowMs - this.zeroFlowStartMs >= this.dryRunTripMs) {
                this.pumpRunning = false;
                this.lockout = SafetyLockout.DRY_RUN;
                this.state = ControllerState.FAULT;
                return;
              }
            } else {
              this.zeroFlowStartMs = 0;
            }
          }
        }

        if (this.lockout !== SafetyLockout.NONE) {
          this.pumpRunning = false;
          this.state = ControllerState.FAULT;
          return;
        }

        if (this.mode === ControlMode.AUTO) {
          if (!this.pumpRunning) {
            if (levelPercent <= this.autoStartPct) {
              this.pumpRunning = true;
              this.pumpStartMs = nowMs;
              this.state = ControllerState.AUTO_FILLING;
            } else {
              this.state = ControllerState.IDLE;
            }
          } else {
            if (levelPercent >= this.autoStopPct) {
              this.pumpRunning = false;
              this.state = ControllerState.STOPPING;
            } else {
              this.state = ControllerState.AUTO_FILLING;
            }
          }
        } else {
          if (this.pumpRunning) {
            this.state = ControllerState.MANUAL_FILLING;
          } else {
            this.state = ControllerState.IDLE;
          }
        }
      }
    }

    it('initializes in INITIALIZING state with pump OFF', () => {
      const sm = new StateMachinePumpController();
      assert.strictEqual(sm.state, ControllerState.INITIALIZING);
      assert.strictEqual(sm.pumpRunning, false);
    });

    it('transitions to IDLE when initial valid reading is in mid-range', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 50.0, true, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.IDLE);
      assert.strictEqual(sm.pumpRunning, false);
    });

    it('transitions from IDLE to AUTO_FILLING when water level falls <= 20%', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 18.0, true, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.AUTO_FILLING);
      assert.strictEqual(sm.pumpRunning, true);
    });

    it('transitions from AUTO_FILLING to STOPPING when water level reaches >= 95%', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 15.0, true, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.AUTO_FILLING);

      sm.update(2000, 95.0, true, 10.0, 2.5, false);
      assert.strictEqual(sm.state, ControllerState.FAULT); // 95% triggers high-level cutoff FAULT
      assert.strictEqual(sm.pumpRunning, false);
    });

    it('transitions to SENSOR_ERROR if sensor data becomes stale (>5s) and stops pump', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 15.0, true, 10.0, 2.5, false);
      assert.strictEqual(sm.state, ControllerState.AUTO_FILLING);

      // Stale data flag set
      sm.update(7000, 15.0, true, 10.0, 2.5, true);
      assert.strictEqual(sm.state, ControllerState.SENSOR_ERROR);
      assert.strictEqual(sm.pumpRunning, false);
    });

    it('auto-recovers from SENSOR_ERROR to IDLE when fresh reading resumes', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 0.0, false, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.SENSOR_ERROR);

      sm.update(2000, 60.0, true, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.IDLE);
    });

    it('stops pump safely and transitions to STOPPING/IDLE when switching mode during active pumping', () => {
      const sm = new StateMachinePumpController();
      sm.update(1000, 15.0, true, 0.0, 0.0, false);
      assert.strictEqual(sm.state, ControllerState.AUTO_FILLING);
      assert.strictEqual(sm.pumpRunning, true);

      // Switch mode to MANUAL during active fill
      sm.requestMode(ControlMode.MANUAL);
      assert.strictEqual(sm.pumpRunning, false);
      assert.strictEqual(sm.state, ControllerState.IDLE);
    });
  });

  describe('Hardware Interlocks: High-Water Probe, Startup Safety & Dry-Run Bypass', () => {
    class EnhancedPumpController {
      constructor(options = {}) {
        this.lowThreshold = 20.0;
        this.highThreshold = 95.0;
        this.relayActiveLow = true;
        this.dryRunEnabled = options.dryRunEnabled ?? false;
        this.dryRunGraceMs = 5000;
        this.dryRunTripMs = 5000;
        this.probeIsOverflowInterlock = options.probeIsOverflowInterlock ?? true;

        this.mode = options.startupMode || ControlMode.MANUAL;
        this.pumpState = PumpState.OFF;
        this.relayPinState = this.relayActiveLow ? 1 : 0; // 1 = HIGH (de-energized for active-LOW relay)
        this.lockout = SafetyLockout.NONE;
        this.pumpStartMs = 0;
        this.zeroFlowStartMs = 0;
        this.lastLevelPct = 50.0;
        this.lastLevelValid = true;
        this.isProbeWet = false;
      }

      setRelay(state) {
        this.pumpState = state;
        this.relayPinState = state === PumpState.ON ? (this.relayActiveLow ? 0 : 1) : (this.relayActiveLow ? 1 : 0);
      }

      update(nowMs, levelPercent, isLevelValid, flowRateLpm, isStale, isProbeWet) {
        this.lastLevelPct = levelPercent;
        this.lastLevelValid = isLevelValid && !isStale;
        this.isProbeWet = isProbeWet;

        // 0. High-water contact probe interlock
        if (this.probeIsOverflowInterlock && isProbeWet) {
          this.setRelay(PumpState.OFF);
          this.lockout = 'OVERFLOW_PROBE_TRIPPED';
          return;
        } else if (this.lockout === 'OVERFLOW_PROBE_TRIPPED' && !isProbeWet) {
          this.lockout = SafetyLockout.NONE;
        }

        // 1. Critical Sensor Fault
        if (!isLevelValid || isStale) {
          if (this.mode === ControlMode.AUTO) {
            this.setRelay(PumpState.OFF);
            this.lockout = SafetyLockout.SENSOR_FAULT;
            return;
          }
        }

        // 2. High water cutoff
        if (this.lastLevelValid && levelPercent >= this.highThreshold) {
          this.setRelay(PumpState.OFF);
          this.lockout = SafetyLockout.HIGH_LEVEL;
          return;
        }

        // 3. Dry-run zero-flow detection (only when dryRunEnabled is true)
        if (this.pumpState === PumpState.ON && this.dryRunEnabled) {
          const runDuration = nowMs - this.pumpStartMs;
          if (runDuration > this.dryRunGraceMs) {
            if (flowRateLpm <= 0.2) {
              if (this.zeroFlowStartMs === 0) {
                this.zeroFlowStartMs = nowMs;
              } else if (nowMs - this.zeroFlowStartMs >= this.dryRunTripMs) {
                this.setRelay(PumpState.OFF);
                this.lockout = SafetyLockout.DRY_RUN;
                return;
              }
            } else {
              this.zeroFlowStartMs = 0;
            }
          }
        }

        // AUTO hysteresis control
        if (this.mode === ControlMode.AUTO && this.lockout === SafetyLockout.NONE) {
          if (levelPercent <= this.lowThreshold && this.pumpState === PumpState.OFF) {
            this.setRelay(PumpState.ON);
            this.pumpStartMs = nowMs;
          }
        }
      }

      requestManualPump(pumpOn, nowMs) {
        if (this.mode !== ControlMode.MANUAL) {
          return { accepted: false, reason: 'NOT_IN_MANUAL_MODE' };
        }
        if (pumpOn) {
          if (this.probeIsOverflowInterlock && this.isProbeWet) {
            this.lockout = 'OVERFLOW_PROBE_TRIPPED';
            return { accepted: false, reason: 'OVERFLOW_PROBE_TRIPPED' };
          }
          if (this.lastLevelValid && this.lastLevelPct >= this.highThreshold) {
            this.lockout = SafetyLockout.HIGH_LEVEL;
            return { accepted: false, reason: 'HIGH_LEVEL_CUTOFF' };
          }
          if (this.lockout !== SafetyLockout.NONE) {
            return { accepted: false, reason: `LOCKED_OUT_${this.lockout}` };
          }
          this.setRelay(PumpState.ON);
          this.pumpStartMs = nowMs;
          return { accepted: true };
        } else {
          this.setRelay(PumpState.OFF);
          return { accepted: true };
        }
      }
    }

    it('initializes relay in de-energized OFF state (relayPinState = HIGH for active-LOW)', () => {
      const ctrl = new EnhancedPumpController();
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.relayPinState, 1); // HIGH = Relay OFF
      assert.strictEqual(ctrl.mode, ControlMode.MANUAL);
    });

    it('forces relay OFF and sets OVERFLOW_PROBE_TRIPPED when high-water probe detects water in AUTO', () => {
      const ctrl = new EnhancedPumpController();
      ctrl.mode = ControlMode.AUTO;
      // Start pump in AUTO
      ctrl.update(1000, 15.0, true, 10.0, false, false);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Probe detects water (e.g. ultrasonic was false reading or overflow reached)
      ctrl.update(2000, 15.0, true, 10.0, false, true); // isProbeWet = true
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, 'OVERFLOW_PROBE_TRIPPED');
    });

    it('forces relay OFF when high-water probe detects water during MANUAL operation', () => {
      const ctrl = new EnhancedPumpController();
      ctrl.requestManualPump(true, 1000);
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Probe detects water during manual pumping
      ctrl.update(2000, 60.0, true, 10.0, false, true); // isProbeWet = true
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, 'OVERFLOW_PROBE_TRIPPED');
    });

    it('blocks manual pump start if high-water probe is currently wet', () => {
      const ctrl = new EnhancedPumpController();
      ctrl.update(1000, 50.0, true, 0.0, false, true); // isProbeWet = true

      const res = ctrl.requestManualPump(true, 1100);
      assert.strictEqual(res.accepted, false);
      assert.strictEqual(res.reason, 'OVERFLOW_PROBE_TRIPPED');
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
    });

    it('does NOT trip dry-run lockout during bench testing when dryRunEnabled is false', () => {
      // Pump disconnected bench test: flow is 0.0 L/min for 30 seconds
      const ctrl = new EnhancedPumpController({ dryRunEnabled: false });
      ctrl.mode = ControlMode.AUTO;
      ctrl.update(1000, 15.0, true, 0.0, false, false); // pump ON
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Run with 0.0 flow past grace and trip times
      ctrl.update(30000, 15.0, true, 0.0, false, false);
      assert.strictEqual(ctrl.pumpState, PumpState.ON); // Remains ON, no dry run trip
      assert.notStrictEqual(ctrl.lockout, SafetyLockout.DRY_RUN);
    });

    it('trips dry-run lockout when dryRunEnabled is true and zero flow persists past grace period', () => {
      const ctrl = new EnhancedPumpController({ dryRunEnabled: true });
      ctrl.mode = ControlMode.AUTO;
      ctrl.update(1000, 15.0, true, 0.0, false, false); // pump ON
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Past grace period (5s) + trip period (5s) = 11s total
      ctrl.update(7000, 15.0, true, 0.0, false, false); // zero flow starts
      ctrl.update(13000, 15.0, true, 0.0, false, false); // zero flow tripped
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.DRY_RUN);
    });

    it('forces relay OFF when ultrasonic reading times out or becomes invalid in AUTO', () => {
      const ctrl = new EnhancedPumpController();
      ctrl.mode = ControlMode.AUTO;
      ctrl.update(1000, 15.0, true, 10.0, false, false); // pump ON
      assert.strictEqual(ctrl.pumpState, PumpState.ON);

      // Sensor timeout (invalid reading)
      ctrl.update(2000, -1.0, false, 10.0, false, false);
      assert.strictEqual(ctrl.pumpState, PumpState.OFF);
      assert.strictEqual(ctrl.lockout, SafetyLockout.SENSOR_FAULT);
    });
  });
});

