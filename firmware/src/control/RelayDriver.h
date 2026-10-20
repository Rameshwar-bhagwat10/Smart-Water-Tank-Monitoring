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

private:
  uint8_t _pin;
  bool _activeLow;
  bool _isEnergized;
};

} // namespace SmartTank
