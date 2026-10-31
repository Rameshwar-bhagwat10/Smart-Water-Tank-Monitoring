#include "CurrentSensor.h"
#include <math.h>

namespace SmartTank {

CurrentSensor::CurrentSensor(uint8_t pin, float sensitivityMvPerA, float zeroOffsetMv, float dividerRatio)
    : _pin(pin),
      _sensitivityMvPerA(sensitivityMvPerA > 0.0f ? sensitivityMvPerA : ACS712_SENSITIVITY_MV_PER_A),
      _zeroOffsetMv(zeroOffsetMv),
      _dividerRatio(dividerRatio > 0.0f && dividerRatio <= 1.0f ? dividerRatio : ACS712_DIVIDER_RATIO),
      _lastCurrentA(0.0f),
      _lastRawAdc(0) {}

void CurrentSensor::begin() {
  pinMode(_pin, INPUT);
  calibrateZero();
}

float CurrentSensor::rawAdcToMillivolts(int rawAdc, float refVoltageMv, int maxCounts) {
  if (maxCounts <= 0) return 0.0f;
  if (rawAdc < 0) rawAdc = 0;
  if (rawAdc > maxCounts) rawAdc = maxCounts;
  return (static_cast<float>(rawAdc) * refVoltageMv) / static_cast<float>(maxCounts);
}

float CurrentSensor::adcMillivoltsToSensorMillivolts(float adcMv, float dividerRatio) {
  if (dividerRatio <= 0.0f || dividerRatio > 1.0f) return adcMv;
  return adcMv / dividerRatio;
}

float CurrentSensor::voltageDeltaToAmperes(float sensorVoltageMv, float zeroOffsetMv, float sensitivityMvPerA) {
  if (sensitivityMvPerA <= 0.0f) return 0.0f;
  float delta = fabsf(sensorVoltageMv - zeroOffsetMv);
  float amps = delta / sensitivityMvPerA;
  // Apply 0.08A noise floor gate
  if (amps < 0.08f) {
    amps = 0.0f;
  }
  return amps;
}

float CurrentSensor::rawAdcToCurrentAmperes(int rawAdc, float zeroOffsetMv, float sensitivityMvPerA,
                                            float dividerRatio, float refVoltageMv, int maxCounts) {
  float adcV = rawAdcToMillivolts(rawAdc, refVoltageMv, maxCounts);
  float sensorV = adcMillivoltsToSensorMillivolts(adcV, dividerRatio);
  return voltageDeltaToAmperes(sensorV, zeroOffsetMv, sensitivityMvPerA);
}

void CurrentSensor::calibrateZero() {
  // Average 50 samples at startup when pump is known to be OFF
  uint32_t sumAdc = 0;
  constexpr int CAL_SAMPLES = 50;
  for (int i = 0; i < CAL_SAMPLES; ++i) {
    sumAdc += analogRead(_pin);
    delay(2);
  }
  float avgAdc = static_cast<float>(sumAdc) / static_cast<float>(CAL_SAMPLES);
  _lastRawAdc = static_cast<int>(avgAdc);

  float adcV = rawAdcToMillivolts(_lastRawAdc, ADC_VOLTAGE_REF_MV, ADC_MAX_COUNTS);
  _zeroOffsetMv = adcMillivoltsToSensorMillivolts(adcV, _dividerRatio);
}

float CurrentSensor::measureDcCurrent(uint16_t samples) {
  if (samples == 0) samples = 32;

  uint32_t sumAdc = 0;
  for (uint16_t i = 0; i < samples; ++i) {
    sumAdc += analogRead(_pin);
    delayMicroseconds(600); // 32 samples * 600µs = ~19.2ms (integrates out 50Hz/60Hz AC ripple)
  }

  _lastRawAdc = static_cast<int>(sumAdc / samples);

  float adcV = rawAdcToMillivolts(_lastRawAdc, ADC_VOLTAGE_REF_MV, ADC_MAX_COUNTS);
  float sensorV = adcMillivoltsToSensorMillivolts(adcV, _dividerRatio);

  float amps = voltageDeltaToAmperes(sensorV, _zeroOffsetMv, _sensitivityMvPerA);
  _lastCurrentA = amps;
  return amps;
}

} // namespace SmartTank

