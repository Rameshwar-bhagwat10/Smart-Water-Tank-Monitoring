#include "PumpController.h"
#include "../config/AppConfig.h"

namespace SmartTank {

PumpController::PumpController(RelayDriver& relay,
                               float autoStartPct, float autoStopPct, float hardCutoffPct,
                               uint32_t maxRuntimeMs, uint32_t dryRunGraceMs, uint32_t dryRunTripMs,
                               float dryRunThresholdLpm, bool dryRunEnabled)
    : _relay(relay),
      _autoStartPct(autoStartPct),
      _autoStopPct(autoStopPct),
      _hardCutoffPct(hardCutoffPct),
      _maxRuntimeMs(maxRuntimeMs),
      _dryRunGraceMs(dryRunGraceMs),
      _dryRunTripMs(dryRunTripMs),
      _dryRunThresholdLpm(dryRunThresholdLpm > 0.0f ? dryRunThresholdLpm : DRY_RUN_FLOW_THRESHOLD_LPM),
      _dryRunEnabled(dryRunEnabled),
      _mode(DEFAULT_STARTUP_IN_MANUAL_MODE ? ControlMode::MANUAL : ControlMode::AUTO),
      _state(ControllerState::IDLE),
      _lockout(SafetyLockout::NONE),
      _pumpStartTimeMs(0),
      _zeroFlowStartTimeMs(0),
      _lastSwitchTimeMs(0),
      _lastLevelPercent(0.0f),
      _lastLevelValid(false),
      _lastProbeWet(false),
      _probeIsOverflowInterlock(WATER_PROBE_IS_OVERFLOW_INTERLOCK) {}

void PumpController::begin() {
  _relay.begin();
  _mode = DEFAULT_STARTUP_IN_MANUAL_MODE ? ControlMode::MANUAL : ControlMode::AUTO;
  _state = ControllerState::IDLE;
  _lockout = SafetyLockout::NONE;
  _pumpStartTimeMs = 0;
  _zeroFlowStartTimeMs = 0;
  _lastSwitchTimeMs = 0;
  _lastLevelPercent = 0.0f;
  _lastLevelValid = false;
  _lastProbeWet = false;
  _probeIsOverflowInterlock = WATER_PROBE_IS_OVERFLOW_INTERLOCK;
}

void PumpController::transitionTo(ControllerState newState) {
  _state = newState;
}

bool PumpController::shouldAutoStart(float levelPercent, float autoStartPct, bool isLevelValid) {
  if (!isLevelValid) return false;
  return levelPercent <= autoStartPct;
}

bool PumpController::shouldAutoStop(float levelPercent, float autoStopPct, bool isLevelValid) {
  if (!isLevelValid) return true; // Sensor invalid -> fail-safe stop
  return levelPercent >= autoStopPct;
}

bool PumpController::isHardCutoffTriggered(float levelPercent, float hardCutoffPct, bool isLevelValid) {
  if (!isLevelValid) return false;
  return levelPercent >= hardCutoffPct;
}

void PumpController::applyPumpAction(bool on, uint32_t currentMillis) {
  if (_relay.isPumpOn() == on) return; // No state change needed

  // Anti-chatter rate limiting (250ms for snappy UI responsiveness)
  if (currentMillis - _lastSwitchTimeMs < 250 && _lastSwitchTimeMs != 0) {
    return;
  }

  _relay.setPump(on);
  _lastSwitchTimeMs = currentMillis;

  if (on) {
    _pumpStartTimeMs = currentMillis;
    _zeroFlowStartTimeMs = 0;
    Serial.printf("[PumpController] ⚡ RELAY ENERGIZED (ON) at %lu ms\n", (unsigned long)currentMillis);
  } else {
    _pumpStartTimeMs = 0;
    _zeroFlowStartTimeMs = 0;
    Serial.printf("[PumpController] 🛑 RELAY DE-ENERGIZED (OFF) at %lu ms | State: %s | Lockout: %s\n",
      (unsigned long)currentMillis, getStateString(), getLockoutString());
  }
}

void PumpController::update(uint32_t currentMillis, float levelPercent, bool isLevelValid,
                            float flowRateLpm, float currentA, bool isStale,
                            bool isProbeWet, bool probeIsOverflowInterlock) {
  (void)currentA; // Reserved for current-signature overload/stall checks
  _lastLevelPercent = levelPercent;
  _lastLevelValid = isLevelValid && !isStale;
  _lastProbeWet = isProbeWet;
  _probeIsOverflowInterlock = probeIsOverflowInterlock;

  // 0. Mandatory Safety Interlock 0: High-Water / Overflow Contact Probe (Enforced across ALL modes)
  if (probeIsOverflowInterlock && isProbeWet) {
    if (_relay.isPumpOn()) {
      Serial.println(F("[Safety] 🛑 PUMP SHUTOFF: Contact Probe (D7) WET (Overflow Protection)!"));
      applyPumpAction(false, currentMillis);
    }
    _lockout = SafetyLockout::OVERFLOW_PROBE_TRIPPED;
    transitionTo(ControllerState::FAULT);
    return;
  } else if (_lockout == SafetyLockout::OVERFLOW_PROBE_TRIPPED && !isProbeWet) {
    _lockout = SafetyLockout::NONE;
  }

  // 1. Mandatory Safety Interlock 1: Sensor Failure Handling (Strictly enforced in AUTO mode)
  if (!isLevelValid || isStale) {
    if (_mode == ControlMode::AUTO) {
      if (_relay.isPumpOn()) {
        Serial.println(F("[Safety] 🛑 PUMP SHUTOFF: Ultrasonic Sensor invalid/stale in AUTO mode!"));
        applyPumpAction(false, currentMillis);
      }
      _lockout = SafetyLockout::SENSOR_FAULT;
      transitionTo(ControllerState::SENSOR_ERROR);
      return;
    }
  } else {
    // Auto-clear sensor fault lockout if valid, fresh reading returns
    if (_lockout == SafetyLockout::SENSOR_FAULT) {
      _lockout = SafetyLockout::NONE;
    }
  }

  // 2. Mandatory Safety Interlock 2: High-Level Cutoff (Enforced across ALL modes)
  if (isHardCutoffTriggered(levelPercent, _hardCutoffPct, _lastLevelValid)) {
    if (_relay.isPumpOn()) {
      Serial.printf("[Safety] 🛑 PUMP SHUTOFF: High-Level Cutoff reached (%.1f%% >= %.1f%%)!\n",
        levelPercent, _hardCutoffPct);
      applyPumpAction(false, currentMillis);
    }
    _lockout = SafetyLockout::HIGH_LEVEL_CUTOFF;
    transitionTo(ControllerState::FAULT);
    return;
  }

  // Auto-clear high level lockout when level recedes safely below stop threshold
  if (_lockout == SafetyLockout::HIGH_LEVEL_CUTOFF && levelPercent < _autoStopPct) {
    _lockout = SafetyLockout::NONE;
  }

  // 3. Mandatory Safety Interlocks while Pump is Energized
  if (_relay.isPumpOn()) {
    uint32_t runningDuration = currentMillis - _pumpStartTimeMs;

    // Runtime limit check (20 minutes max)
    if (runningDuration >= _maxRuntimeMs) {
      applyPumpAction(false, currentMillis);
      _lockout = SafetyLockout::MAX_RUNTIME_EXCEEDED;
      transitionTo(ControllerState::FAULT);
      return;
    }

    // Dry-run / zero-flow detection (only when enabled and pump is running)
    if (_dryRunEnabled && (_mode == ControlMode::AUTO || _lastLevelValid)) {
      if (runningDuration > _dryRunGraceMs) {
        if (flowRateLpm <= _dryRunThresholdLpm) {
          if (_zeroFlowStartTimeMs == 0) {
            _zeroFlowStartTimeMs = currentMillis;
          } else if (currentMillis - _zeroFlowStartTimeMs >= _dryRunTripMs) {
            // Sustained zero flow while pump active -> Trip dry-run shutoff
            applyPumpAction(false, currentMillis);
            _lockout = SafetyLockout::DRY_RUN_DETECTED;
            transitionTo(ControllerState::FAULT);
            return;
          }
        } else {
          _zeroFlowStartTimeMs = 0; // Normal flow detected
        }
      }
    }
  }

  // If safety lockout remains active, maintain relay in safe OFF state
  if (_lockout != SafetyLockout::NONE) {
    if (_mode == ControlMode::MANUAL && _lockout == SafetyLockout::SENSOR_FAULT) {
      _lockout = SafetyLockout::NONE;
    } else {
      if (_relay.isPumpOn()) {
        applyPumpAction(false, currentMillis);
      }
      transitionTo(ControllerState::FAULT);
      return;
    }
  }

  // 4. Operational State Machine Processing
  if (_mode == ControlMode::AUTO) {
    if (!_relay.isPumpOn()) {
      if (shouldAutoStart(levelPercent, _autoStartPct, _lastLevelValid)) {
        applyPumpAction(true, currentMillis);
        transitionTo(ControllerState::AUTO_FILLING);
      } else {
        transitionTo(ControllerState::IDLE);
      }
    } else {
      if (shouldAutoStop(levelPercent, _autoStopPct, _lastLevelValid)) {
        applyPumpAction(false, currentMillis);
        transitionTo(ControllerState::STOPPING);
      } else {
        transitionTo(ControllerState::AUTO_FILLING);
      }
    }
  } else {
    // MANUAL Mode
    if (_relay.isPumpOn()) {
      transitionTo(ControllerState::MANUAL_FILLING);
    } else {
      transitionTo(ControllerState::IDLE);
    }
  }
}

CommandResult PumpController::requestMode(ControlMode newMode, uint32_t currentMillis) {
  if (_mode != newMode) {
    if (_relay.isPumpOn()) {
      Serial.printf("[Safety] 🛑 PUMP FORCED OFF: Mode changed from %s to %s\n",
        getModeString(), newMode == ControlMode::AUTO ? "AUTO" : "MANUAL");
      applyPumpAction(false, currentMillis > 0 ? currentMillis : millis());
      transitionTo(ControllerState::STOPPING);
    }
    _mode = newMode;
    if (newMode == ControlMode::MANUAL && _lockout == SafetyLockout::SENSOR_FAULT) {
      _lockout = SafetyLockout::NONE;
    }
    if (!_relay.isPumpOn()) {
      transitionTo(ControllerState::IDLE);
    }
    return { true, "Mode updated; pump returned to safe state" };
  }
  return { true, "Mode unchanged" };
}

CommandResult PumpController::requestManualPump(bool pumpOn, uint32_t currentMillis) {
  if (_mode != ControlMode::MANUAL) {
    return { false, "Command rejected: Controller is in AUTO mode. Switch to MANUAL first." };
  }

  if (pumpOn) {
    // Interlock 0: High-water overflow contact probe
    if (_probeIsOverflowInterlock && _lastProbeWet) {
      _lockout = SafetyLockout::OVERFLOW_PROBE_TRIPPED;
      transitionTo(ControllerState::FAULT);
      return { false, "Safety lockout: Overflow contact probe is WET." };
    }

    // Interlock 1: High-water cutoff check if ultrasonic reading is valid
    if (_lastLevelValid && _lastLevelPercent >= _hardCutoffPct) {
      _lockout = SafetyLockout::HIGH_LEVEL_CUTOFF;
      transitionTo(ControllerState::FAULT);
      return { false, "Safety lockout: Tank is already full (>= 95%)." };
    }

    // Clear previous transient lockouts (dry-run, max runtime, sensor fault) on manual operator start
    // (hard high-level cutoff and overflow probe remain strictly enforced above)
    if (_lockout == SafetyLockout::DRY_RUN_DETECTED || 
        _lockout == SafetyLockout::MAX_RUNTIME_EXCEEDED || 
        _lockout == SafetyLockout::SENSOR_FAULT) {
      _lockout = SafetyLockout::NONE;
    }

    // Interlock 2: Active safety lockout
    if (_lockout != SafetyLockout::NONE) {
      return { false, "Safety lockout: Cannot start pump while safety fault is active." };
    }

    _lockout = SafetyLockout::NONE;
    _relay.setPump(true);
    _pumpStartTimeMs = currentMillis;
    _zeroFlowStartTimeMs = 0;
    _lastSwitchTimeMs = currentMillis;
    transitionTo(ControllerState::MANUAL_FILLING);
    return { true, "Pump ON executed" };
  } else {
    _lockout = SafetyLockout::NONE;
    _relay.setPump(false);
    _pumpStartTimeMs = 0;
    _zeroFlowStartTimeMs = 0;
    _lastSwitchTimeMs = currentMillis;
    transitionTo(ControllerState::IDLE);
    return { true, "Pump OFF executed" };
  }
}

void PumpController::clearSafetyLockout() {
  _lockout = SafetyLockout::NONE;
  if (!_relay.isPumpOn()) {
    transitionTo(ControllerState::IDLE);
  }
}

const char* PumpController::getStateString() const {
  switch (_state) {
    case ControllerState::INITIALIZING: return "INITIALIZING";
    case ControllerState::IDLE: return "IDLE";
    case ControllerState::AUTO_FILLING: return "AUTO_FILLING";
    case ControllerState::MANUAL_FILLING: return "MANUAL_FILLING";
    case ControllerState::STOPPING: return "STOPPING";
    case ControllerState::FAULT: return "FAULT";
    case ControllerState::SENSOR_ERROR: return "SENSOR_ERROR";
    default: return "UNKNOWN";
  }
}

const char* PumpController::getLockoutString() const {
  switch (_lockout) {
    case SafetyLockout::HIGH_LEVEL_CUTOFF: return "HIGH_LEVEL_CUTOFF";
    case SafetyLockout::MAX_RUNTIME_EXCEEDED: return "MAX_RUNTIME_EXCEEDED";
    case SafetyLockout::DRY_RUN_DETECTED: return "DRY_RUN_DETECTED";
    case SafetyLockout::SENSOR_FAULT: return "SENSOR_FAULT";
    case SafetyLockout::OVERFLOW_PROBE_TRIPPED: return "OVERFLOW_PROBE_TRIPPED";
    default: return "NONE";
  }
}

} // namespace SmartTank

