#pragma once

#include <Arduino.h>

namespace SmartTank {

class FlowSensor {
public:
  explicit FlowSensor(uint8_t pin, float pulsesPerLitre);

  void begin();
  void update(uint32_t deltaMs);

  float getFlowRateLpm() const { return _flowRateLpm; }
  float getTotalLitres() const { return _totalLitres; }
  uint32_t getCumulativePulses() const;
  bool isWaterFlowing() const { return _flowRateLpm > 0.1f; }
  bool isPlausible() const { return _isPlausible; }
  uint32_t getLastPulseTimeMs() const { return _lastPulseTimeMs; }

  void resetTotalLitres();
  void setTotalLitres(float litres);
  void setCalibration(float pulsesPerLitre) {
    if (pulsesPerLitre > 0.0f) _pulsesPerLitre = pulsesPerLitre;
  }
  float getCalibration() const { return _pulsesPerLitre; }

  static constexpr float MAX_PLAUSIBLE_LPM = 60.0f;

  // Pure static calculations for unit testing
  static float calculateFlowRateLpm(uint32_t pulsesInInterval, uint32_t intervalMs, float pulsesPerLitre);
  static float calculateVolumeLitres(uint32_t cumulativePulses, float pulsesPerLitre);

  // ISR callback hook
  static void IRAM_ATTR onPulseInterrupt();

private:
  uint8_t _pin;
  float _pulsesPerLitre;

  float _flowRateLpm;
  float _totalLitres;
  bool _isPlausible;
  uint32_t _lastPulseTimeMs;

  static volatile uint32_t _interruptPulseCount;
  static volatile uint32_t _lastInterruptTimeMs;
  uint32_t _lastTotalPulseCount;
};

} // namespace SmartTank
