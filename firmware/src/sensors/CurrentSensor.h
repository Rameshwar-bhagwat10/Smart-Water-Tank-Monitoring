#pragma once

#include <Arduino.h>

namespace SmartTank {

class CurrentSensor {
public:
  CurrentSensor(uint8_t pin, float sensitivityMvPerA, float zeroOffsetMv = 2500.0f);

  void begin();
  void calibrateZero();
  float measureRmsCurrent(uint16_t samples = 150);

  float getLastCurrentA() const { return _lastCurrentA; }
  float getZeroOffsetMv() const { return _zeroOffsetMv; }

  // Pure static calculation functions for unit testing
  static float rawAdcToMillivolts(int rawAdc, float refVoltageMv = 3300.0f, int maxCounts = 1023);
  static float voltageDeltaToAmperes(float voltageMv, float zeroOffsetMv, float sensitivityMvPerA);

private:
  uint8_t _pin;
  float _sensitivityMvPerA;
  float _zeroOffsetMv;
  float _lastCurrentA;
};

} // namespace SmartTank
