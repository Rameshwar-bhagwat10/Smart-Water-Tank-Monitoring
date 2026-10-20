#pragma once

#include <Arduino.h>

namespace SmartTank {

/**
 * @brief Water Leakage Sensor Driver Extension Interface
 * 
 * Hardware Status: UNCONFIRMED / NOT CONNECTED.
 * 
 * Per Phase 4 Hardware Specification and Non-Negotiable Rules:
 * Water leakage detection hardware, electrical conditioning, and specific GPIO
 * pin assignments have not been bench-metered or physically confirmed.
 * 
 * To ensure safe, un-fabricated operation:
 * - This extension class is disabled by default (_enabled = false).
 * - isLeakDetected() returns false.
 * - getStatusString() reports "DISABLED_NOT_INSTALLED".
 * - Physical pin assignment is left unallocated until hardware BOM is finalized.
 */
class LeakageSensor {
public:
  LeakageSensor() : _enabled(false), _pin(255) {}
  explicit LeakageSensor(uint8_t pin) : _enabled(false), _pin(pin) {}

  void begin() {
    // Disabled pending hardware verification
  }

  bool isEnabled() const { return _enabled; }
  bool isLeakDetected() const { return false; }
  const char* getStatusString() const { return "DISABLED_NOT_INSTALLED"; }

private:
  bool _enabled;
  uint8_t _pin;
};

} // namespace SmartTank
