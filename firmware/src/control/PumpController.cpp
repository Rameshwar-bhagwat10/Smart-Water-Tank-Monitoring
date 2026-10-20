#include "PumpController.h"
#include "../config/AppConfig.h"

namespace SmartTank {

PumpController::PumpController(RelayDriver& relay,
                               float autoStartPct, float autoStopPct, float hardCutoffPct,
                               uint32_t maxRuntimeMs, uint32_t dryRunGraceMs, uint32_t dryRunTripMs)
    : _relay(relay),
      _autoStartPct(autoStartPct),
      _autoStopPct(autoStopPct),
      _hardCutoffPct(hardCutoffPct),
      _maxRuntimeMs(maxRuntimeMs),
      _dryRunGraceMs(dryRunGraceMs),
      _dryRunTripMs(dryRunTripMs),
      _mode(ControlMode::AUTO),
      _state(ControllerState::INITIALIZING),
      _lockout(SafetyLockout::NONE),
      _pumpStartTimeMs(0),
      _zeroFlowStartTimeMs(0),
      _lastSwitchTimeMs(0),
      _lastLevelPercent(0.0f),
      _lastLevelValid(false) {}

void PumpController::begin() {
  _relay.begin();
  _mode = ControlMode::AUTO;
  _state = ControllerState::INITIALIZING;
  _lockout = SafetyLockout::NONE;
  _pumpStartTimeMs = 0;
  _zeroFlowStartTimeMs = 0;
  _lastSwitchTimeMs = 0;
  _lastLevelPercent = 0.0f;
  _lastLevelValid = false;
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
  if (!isLevelValid) return true;
  return levelPercent >= hardCutoffPct;
}

void PumpController::applyPumpAction(bool on, uint32_t currentMillis) {
  if (_relay.isPumpOn() == on) return; // No state change needed

  // Anti-chatter rate limiting
  if (currentMillis - _lastSwitchTimeMs < MIN_SWITCHING_INTERVAL_MS && _lastSwitchTimeMs != 0) {
    return;
  }

  _relay.setPump(on);
  _lastSwitchTimeMs = currentMillis;

  if (on) {
    _pumpStartTimeMs = currentMillis;
    _zeroFlowStartTimeMs = 0;
  } else {
    _pumpStartTimeMs = 0;
    _zeroFlowStartTimeMs = 0;
  }
}

void PumpController::update(uint32_t currentMillis, float levelPercent, bool isLevelValid,
                            float flowRateLpm, float currentA, bool isStale) {
  (void)currentA; // Reserved for current-signature overload/stall checks
  _lastLevelPercent = levelPercent;
  _lastLevelValid = isLevelValid && !isStale;

  // 1. Mandatory Safety Interlock 1: Sensor Failure Handling (Strictly enforced in AUTO mode)
  if (!isLevelValid || isStale) {
    if (_mode == ControlMode::AUTO) {
      if (_relay.isPumpOn()) {
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

    // Dry-run / zero-flow detection (after grace period)
    if (runningDuration > _dryRunGraceMs) {
      if (flowRateLpm <= 0.1f) {
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

  // If safety lockout remains active, maintain relay in safe OFF state
  if (_lockout != SafetyLockout::NONE) {
    if (_relay.isPumpOn()) {
      applyPumpAction(false, currentMillis);
    }
    transitionTo(ControllerState::FAULT);
    return;
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
      applyPumpAction(false, currentMillis > 0 ? currentMillis : millis());
      transitionTo(ControllerState::STOPPING);
    }
    _mode = newMode;
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
    // High-water cutoff check if sensor reading is valid
    if (_lastLevelValid && _lastLevelPercent >= _hardCutoffPct) {
      _lockout = SafetyLockout::HIGH_LEVEL_CUTOFF;
      transitionTo(ControllerState::FAULT);
      return { false, "Safety lockout: Tank is already full (>= 95%)." };
    }

    _lockout = SafetyLockout::NONE;
    applyPumpAction(true, currentMillis);
    transitionTo(ControllerState::MANUAL_FILLING);
    return { true, "Pump ON executed" };
  } else {
    _lockout = SafetyLockout::NONE;
    applyPumpAction(false, currentMillis);
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
    default: return "NONE";
  }
}

} // namespace SmartTank

