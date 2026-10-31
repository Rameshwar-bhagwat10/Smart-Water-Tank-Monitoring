#pragma once

#include <Arduino.h>
#include "RelayDriver.h"
#include "../config/AppConfig.h"

namespace SmartTank {

enum class ControlMode {
  AUTO,
  MANUAL
};

enum class ControllerState {
  INITIALIZING,
  IDLE,
  AUTO_FILLING,
  MANUAL_FILLING,
  STOPPING,
  FAULT,
  SENSOR_ERROR
};

enum class SafetyLockout {
  NONE,
  HIGH_LEVEL_CUTOFF,
  MAX_RUNTIME_EXCEEDED,
  DRY_RUN_DETECTED,
  SENSOR_FAULT,
  OVERFLOW_PROBE_TRIPPED
};

struct CommandResult {
  bool accepted;
  const char* reason;
};

class PumpController {
public:
  PumpController(RelayDriver& relay,
                 float autoStartPct, float autoStopPct, float hardCutoffPct,
                 uint32_t maxRuntimeMs, uint32_t dryRunGraceMs, uint32_t dryRunTripMs,
                 float dryRunThresholdLpm = DRY_RUN_FLOW_THRESHOLD_LPM,
                 bool dryRunEnabled = DRY_RUN_PROTECTION_ENABLED);

  void begin();
  void update(uint32_t currentMillis, float levelPercent, bool isLevelValid,
              float flowRateLpm, float currentA, bool isStale = false,
              bool isProbeWet = false, bool probeIsOverflowInterlock = WATER_PROBE_IS_OVERFLOW_INTERLOCK);

  // Command handlers
  CommandResult requestMode(ControlMode newMode, uint32_t currentMillis = 0);
  CommandResult requestManualPump(bool pumpOn, uint32_t currentMillis);
  void clearSafetyLockout();

  ControlMode getMode() const { return _mode; }
  const char* getModeString() const { return _mode == ControlMode::AUTO ? "AUTO" : "MANUAL"; }

  ControllerState getState() const { return _state; }
  const char* getStateString() const;

  bool isPumpRunning() const { return _relay.isPumpOn(); }
  const char* getPumpStateString() const { return _relay.getStateString(); }

  SafetyLockout getLockout() const { return _lockout; }
  const char* getLockoutString() const;

  void setDryRunEnabled(bool enabled) { _dryRunEnabled = enabled; }
  bool isDryRunEnabled() const { return _dryRunEnabled; }
  void setDryRunThresholdLpm(float lpm) { if (lpm > 0.0f) _dryRunThresholdLpm = lpm; }

  // Pure state machine logic for host unit testing
  static bool shouldAutoStart(float levelPercent, float autoStartPct, bool isLevelValid);
  static bool shouldAutoStop(float levelPercent, float autoStopPct, bool isLevelValid);
  static bool isHardCutoffTriggered(float levelPercent, float hardCutoffPct, bool isLevelValid);

private:
  RelayDriver& _relay;

  float _autoStartPct;
  float _autoStopPct;
  float _hardCutoffPct;

  uint32_t _maxRuntimeMs;
  uint32_t _dryRunGraceMs;
  uint32_t _dryRunTripMs;
  float _dryRunThresholdLpm;
  bool _dryRunEnabled;

  ControlMode _mode;
  ControllerState _state;
  SafetyLockout _lockout;

  uint32_t _pumpStartTimeMs;
  uint32_t _zeroFlowStartTimeMs;
  uint32_t _lastSwitchTimeMs;

  float _lastLevelPercent;
  bool _lastLevelValid;
  bool _lastProbeWet;
  bool _probeIsOverflowInterlock;

  void applyPumpAction(bool on, uint32_t currentMillis);
  void transitionTo(ControllerState newState);
};

} // namespace SmartTank

