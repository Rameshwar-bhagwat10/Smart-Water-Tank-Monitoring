#include "RelayDriver.h"

namespace SmartTank {

RelayDriver::RelayDriver(uint8_t pin, bool activeLow)
    : _pin(pin),
      _activeLow(activeLow),
      _isEnergized(false) {}

void RelayDriver::begin() {
  // Safe boot sequence: Set pin HIGH if active-LOW, or LOW if active-HIGH BEFORE enabling OUTPUT mode
  uint8_t deenergizedState = _activeLow ? HIGH : LOW;
  digitalWrite(_pin, deenergizedState);
  pinMode(_pin, OUTPUT);
  digitalWrite(_pin, deenergizedState);
  _isEnergized = false;
}

void RelayDriver::setPump(bool on) {
  _isEnergized = on;
  uint8_t pinState = 0;
  if (_activeLow) {
    pinState = on ? LOW : HIGH;
  } else {
    pinState = on ? HIGH : LOW;
  }
  digitalWrite(_pin, pinState);
}

} // namespace SmartTank
