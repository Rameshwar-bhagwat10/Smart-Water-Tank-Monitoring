#pragma once

#include <Arduino.h>

namespace SmartTank {

/**
 * @brief Water Level Contact Probe with LM393 Comparator Module
 * 
 * Hardware Wiring (Confirmed):
 * - VCC -> 3.3 V rail
 * - GND -> common GND
 * - DO  -> NodeMCU D7 / GPIO13
 * - AO  -> Not connected
 * 
 * Electrical Polarity:
 * Most LM393 comparator modules pull DO LOW when water contacts are bridged (active-LOW).
 * When dry (contacts open), the module's pull-up resistor pulls DO HIGH.
 * Polarity is made configurable via `activeLow` parameter.
 */
class WaterLevelProbe {
public:
  explicit WaterLevelProbe(uint8_t pin = 13, bool activeLow = true)
      : _pin(pin),
        _activeLow(activeLow),
        _isWaterDetected(false),
        _rawPinState(HIGH) {}

  void begin() {
    pinMode(_pin, INPUT);
    update();
  }

  void update() {
    _rawPinState = digitalRead(_pin);
    _isWaterDetected = _activeLow ? (_rawPinState == LOW) : (_rawPinState == HIGH);
  }

  bool isWaterDetected() const { return _isWaterDetected; }
  uint8_t getRawPinState() const { return _rawPinState; }
  bool isActiveLow() const { return _activeLow; }
  void setActiveLow(bool activeLow) {
    _activeLow = activeLow;
    update();
  }

  const char* getStatusString() const {
    return _isWaterDetected ? "WATER_DETECTED" : "DRY";
  }

private:
  uint8_t _pin;
  bool _activeLow;
  bool _isWaterDetected;
  uint8_t _rawPinState;
};

} // namespace SmartTank
