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
      _lockout(SafetyLockout::NONE),
      _pumpStartTimeMs(0),
      _zeroFlowStartTimeMs(0),
      _lastSwitchTimeMs(0) {}

void PumpController::begin() {
  _relay.begin();
  _mode = ControlMode::AUTO;
  _lockout = SafetyLockout::NONE;
  _pumpStartTimeMs = 0;
  _zeroFlowStartTimeMs = 0;
  _lastSwitchTimeMs = 0;
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

void PumpController::update(uint32_t currentMillis, float levelPercent, bool isLevelValid, float flowRateLpm, float currentA) {
  // 1. Mandatory Safety Interlock 1: Sensor Failure Handling
  if (!isLevelValid) {
    if (_relay.isPumpOn()) {
      applyPumpAction(false, currentMillis);
      _lockout = SafetyLockout::SENSOR_FAULT;
    }
    return;
  }

  // 2. Mandatory Safety Interlock 2: High-Level Cutoff (Enforced in ALL modes!)
  if (isHardCutoffTriggered(levelPercent, _hardCutoffPct, isLevelValid)) {
    if (_relay.isPumpOn()) {
      applyPumpAction(false, currentMillis);
      _lockout = SafetyLockout::HIGH_LEVEL_CUTOFF;
    }
    return;
  }

  // 3. Mandatory Safety Interlock 3: Maximum Continuous Pump Runtime
  if (_relay.isPumpOn()) {
    uint32_t runningDuration = currentMillis - _pumpStartTimeMs;
    if (runningDuration >= _maxRuntimeMs) {
      applyPumpAction(false, currentMillis);
      _lockout = SafetyLockout::MAX_RUNTIME_EXCEEDED;
      return;
    }

    // 4. Mandatory Safety Interlock 4: Dry-Run / Zero-Flow Detection
    // Check flow only after grace period
    if (runningDuration > _dryRunGraceMs) {
      if (flowRateLpm <= 0.1f) {
        if (_zeroFlowStartTimeMs == 0) {
          _zeroFlowStartTimeMs = currentMillis;
        } else if (currentMillis - _zeroFlowStartTimeMs >= _dryRunTripMs) {
          // Sustained zero flow while pump active -> Trip dry-run shutoff
          applyPumpAction(false, currentMillis);
          _lockout = SafetyLockout::DRY_RUN_DETECTED;
          return;
        }
      } else {
        _zeroFlowStartTimeMs = 0; // Water is flowing normally
      }
    }
  }

  // If safety lockout is active, do not allow automatic restart
  if (_lockout != SafetyLockout::NONE) {
    return;
  }

  // 5. Automatic Mode Operational Control
  if (_mode == ControlMode::AUTO) {
    if (!_relay.isPumpOn()) {
      if (shouldAutoStart(levelPercent, _autoStartPct, isLevelValid)) {
        applyPumpAction(true, currentMillis);
      }
    } else {
      if (shouldAutoStop(levelPercent, _autoStopPct, isLevelValid)) {
        applyPumpAction(false, currentMillis);
      }
    }
  }
}

CommandResult PumpController::requestMode(ControlMode newMode) {
  _mode = newMode;
  return { true, "Mode updated successfully" };
}

CommandResult PumpController::requestManualPump(bool pumpOn, uint32_t currentMillis) {
  if (_mode != ControlMode::MANUAL) {
    return { false, "Command rejected: Controller is in AUTO mode. Switch to MANUAL first." };
  }

  if (pumpOn) {
    // Check if safety lockout prevents startup
    if (_lockout != SafetyLockout::NONE) {
      return { false, "Command rejected: Safety lockout is active." };
    }

    applyPumpAction(true, currentMillis);
    return { true, "Pump ON executed" };
  } else {
    applyPumpAction(false, currentMillis);
    return { true, "Pump OFF executed" };
  }
}

void PumpController::clearSafetyLockout() {
  _lockout = SafetyLockout::NONE;
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
