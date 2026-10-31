#include "RelayDriver.h"

namespace SmartTank {

RelayDriver::RelayDriver(uint8_t pin, bool activeLow)
    : _pin(pin),
      _activeLow(activeLow),
      _isEnergized(false) {}

void RelayDriver::begin() {
  _isEnergized = false;
  if (_activeLow) {
    // For 5V active-LOW optocoupled relays driven by 3.3V ESP8266:
    // Putting pin in INPUT (High-Z) mode completely stops 1.7V leakage current from 5V rail.
    pinMode(_pin, INPUT);
  } else {
    digitalWrite(_pin, LOW);
    pinMode(_pin, OUTPUT);
  }
}

void RelayDriver::setPump(bool on) {
  _isEnergized = on;
  if (_activeLow) {
    if (on) {
      // Actively pull pin to 0V / GND to complete circuit through optocoupler
      digitalWrite(_pin, LOW);
      pinMode(_pin, OUTPUT);
    } else {
      // High-Z disconnects the path to GND: 100% turns off optocoupler and LED!
      pinMode(_pin, INPUT);
    }
  } else {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, on ? HIGH : LOW);
  }
}

} // namespace SmartTank
