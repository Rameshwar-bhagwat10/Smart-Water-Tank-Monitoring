#pragma once

#include <Arduino.h>
#include "RelayDriver.h"

namespace SmartTank {

enum class ControlMode {
  AUTO,
  MANUAL
};

enum class SafetyLockout {
  NONE,
  HIGH_LEVEL_CUTOFF,
  MAX_RUNTIME_EXCEEDED,
  DRY_RUN_DETECTED,
  SENSOR_FAULT
};

struct CommandResult {
  bool accepted;
  const char* reason;
};

class PumpController {
public:
  PumpController(RelayDriver& relay,
                 float autoStartPct, float autoStopPct, float hardCutoffPct,
                 uint32_t maxRuntimeMs, uint32_t dryRunGraceMs, uint32_t dryRunTripMs);

  void begin();
  void update(uint32_t currentMillis, float levelPercent, bool isLevelValid, float flowRateLpm, float currentA);

  // Command handlers
  CommandResult requestMode(ControlMode newMode);
  CommandResult requestManualPump(bool pumpOn, uint32_t currentMillis);
  void clearSafetyLockout();

  ControlMode getMode() const { return _mode; }
  const char* getModeString() const { return _mode == ControlMode::AUTO ? "AUTO" : "MANUAL"; }
  bool isPumpRunning() const { return _relay.isPumpOn(); }
  const char* getPumpStateString() const { return _relay.getStateString(); }
  SafetyLockout getLockout() const { return _lockout; }
  const char* getLockoutString() const;

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

  ControlMode _mode;
  SafetyLockout _lockout;

  uint32_t _pumpStartTimeMs;
  uint32_t _zeroFlowStartTimeMs;
  uint32_t _lastSwitchTimeMs;

  float _lastLevelPercent;
  bool _lastLevelValid;

  void applyPumpAction(bool on, uint32_t currentMillis);
};

} // namespace SmartTank
