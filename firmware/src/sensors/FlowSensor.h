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

  void resetTotalLitres();
  void setTotalLitres(float litres);

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

  static volatile uint32_t _interruptPulseCount;
  uint32_t _lastTotalPulseCount;
};

} // namespace SmartTank
