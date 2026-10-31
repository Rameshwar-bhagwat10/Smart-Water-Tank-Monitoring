#pragma once

#include <Arduino.h>
#include "../config/AppConfig.h"

namespace SmartTank {

class CurrentSensor {
public:
  CurrentSensor(uint8_t pin,
                float sensitivityMvPerA = ACS712_SENSITIVITY_MV_PER_A,
                float zeroOffsetMv = ACS712_QUIESCENT_MV,
                float dividerRatio = ACS712_DIVIDER_RATIO);

  void begin();
  void calibrateZero();
  float measureDcCurrent(uint16_t samples = 32);
  // Backwards-compatible alias for existing callers
  float measureRmsCurrent(uint16_t samples = 32) { return measureDcCurrent(samples); }

  float getLastCurrentA() const { return _lastCurrentA; }
  int getLastRawAdc() const { return _lastRawAdc; }
  float getZeroOffsetMv() const { return _zeroOffsetMv; }
  float getDividerRatio() const { return _dividerRatio; }

  void setDividerRatio(float ratio) { if (ratio > 0.0f && ratio <= 1.0f) _dividerRatio = ratio; }
  void setSensitivity(float sensitivityMvPerA) { if (sensitivityMvPerA > 0.0f) _sensitivityMvPerA = sensitivityMvPerA; }
  void setZeroOffset(float zeroOffsetMv) { _zeroOffsetMv = zeroOffsetMv; }

  // Returns true if current exceeds motor running threshold (default 0.2A)
  bool isMotorCurrentDetected(float thresholdA = 0.2f) const {
    return _lastCurrentA >= thresholdA;
  }

  // Pure static calculation functions for unit testing and offline calculation
  static float rawAdcToMillivolts(int rawAdc, float refVoltageMv = 3300.0f, int maxCounts = 1023);
  static float adcMillivoltsToSensorMillivolts(float adcMv, float dividerRatio);
  static float voltageDeltaToAmperes(float sensorVoltageMv, float zeroOffsetMv, float sensitivityMvPerA);
  static float rawAdcToCurrentAmperes(int rawAdc, float zeroOffsetMv, float sensitivityMvPerA,
                                      float dividerRatio = ACS712_DIVIDER_RATIO,
                                      float refVoltageMv = 3300.0f, int maxCounts = 1023);

private:
  uint8_t _pin;
  float _sensitivityMvPerA;
  float _zeroOffsetMv;
  float _dividerRatio;
  float _lastCurrentA;
  int _lastRawAdc;
};

} // namespace SmartTank
