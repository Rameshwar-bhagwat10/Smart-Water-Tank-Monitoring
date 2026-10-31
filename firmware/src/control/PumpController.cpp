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
  (void)flowRateLpm;
  (void)currentA;
  (void)probeIsOverflowInterlock;

  _lastLevelPercent = levelPercent;
  _lastLevelValid = isLevelValid && !isStale;
  _lastProbeWet = isProbeWet;
  _probeIsOverflowInterlock = probeIsOverflowInterlock;

  // 1. MANUAL Mode: Strictly operator controlled.
  // The pump maintains whatever state the operator set (ON or OFF) until operator commands otherwise.
  if (_mode == ControlMode::MANUAL) {
    _lockout = SafetyLockout::NONE;
    if (_relay.isPumpOn()) {
      transitionTo(ControllerState::MANUAL_FILLING);
    } else {
      transitionTo(ControllerState::IDLE);
    }
    return;
  }

  // 2. AUTO Mode: Automatically control pump based on water level and level sensor.
  // "when the tank level is above the 95% and the level sensor detect the water then and then only the pump will get off,
  // and if water reacher to the below 20% then the pump will get on automatically"
  bool shouldStop = (levelPercent >= 95.0f && isProbeWet);
  bool shouldStart = (levelPercent <= 20.0f);

  if (_relay.isPumpOn()) {
    // Currently filling in AUTO mode
    // "then and then only the pump will get off" when level >= 95% AND probe detects water
    if (shouldStop) {
      Serial.printf("[AutoControl] 🛑 Tank FULL: level=%.1f%% >= 95%% and probe=WET -> Motor OFF\n", levelPercent);
      applyPumpAction(false, currentMillis);
      transitionTo(ControllerState::IDLE);
    } else {
      transitionTo(ControllerState::AUTO_FILLING);
    }
  } else {
    // Currently stopped / idle in AUTO mode
    // "and if water reacher to the below 20% then the pump will get on automatically"
    if (shouldStart) {
      Serial.printf("[AutoControl] ⚡ Water LOW: level=%.1f%% <= 20%% -> Motor ON\n", levelPercent);
      applyPumpAction(true, currentMillis);
      transitionTo(ControllerState::AUTO_FILLING);
    } else {
      transitionTo(ControllerState::IDLE);
    }
  }
}

CommandResult PumpController::requestMode(ControlMode newMode, uint32_t currentMillis) {
  _mode = newMode;
  _lockout = SafetyLockout::NONE;
  uint32_t nowMs = (currentMillis > 0) ? currentMillis : millis();

  if (_mode == ControlMode::AUTO) {
    bool shouldStop = (_lastLevelPercent >= 95.0f && _lastProbeWet);
    bool shouldStart = (_lastLevelPercent <= 20.0f);
    if (shouldStop) {
      applyPumpAction(false, nowMs);
      transitionTo(ControllerState::IDLE);
      return { true, "Auto mode active; tank full (pump idle)" };
    } else if (shouldStart) {
      applyPumpAction(true, nowMs);
      transitionTo(ControllerState::AUTO_FILLING);
      return { true, "Auto mode active; level low (pump filling)" };
    } else {
      if (_relay.isPumpOn()) {
        transitionTo(ControllerState::AUTO_FILLING);
      } else {
        transitionTo(ControllerState::IDLE);
      }
      return { true, "Auto mode active" };
    }
  } else {
    // In MANUAL mode, maintain current state
    if (_relay.isPumpOn()) {
      transitionTo(ControllerState::MANUAL_FILLING);
    } else {
      transitionTo(ControllerState::IDLE);
    }
    return { true, "Manual mode active" };
  }
}

CommandResult PumpController::requestManualPump(bool pumpOn, uint32_t currentMillis) {
  _mode = ControlMode::MANUAL;
  _lockout = SafetyLockout::NONE;
  uint32_t nowMs = (currentMillis > 0) ? currentMillis : millis();

  applyPumpAction(pumpOn, nowMs);

  if (pumpOn) {
    transitionTo(ControllerState::MANUAL_FILLING);
    return { true, "Manual: Pump ON executed" };
  } else {
    transitionTo(ControllerState::IDLE);
    return { true, "Manual: Pump OFF executed" };
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

