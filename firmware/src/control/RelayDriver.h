#pragma once

#include <Arduino.h>

namespace SmartTank {

class RelayDriver {
public:
  RelayDriver(uint8_t pin, bool activeLow = true);

  void begin();
  void setPump(bool on);
  bool isPumpOn() const { return _isEnergized; }
  const char* getStateString() const { return _isEnergized ? "ON" : "OFF"; }
  bool isActiveLow() const { return _activeLow; }
  void setActiveLow(bool activeLow) {
    _activeLow = activeLow;
    setPump(false); // Ensure relay remains safely de-energized with new polarity
  }

private:
  uint8_t _pin;
  bool _activeLow;
  bool _isEnergized;
};

} // namespace SmartTank
