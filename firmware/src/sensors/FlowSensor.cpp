#include "FlowSensor.h"
#include "../config/AppConfig.h"

namespace SmartTank {

volatile uint32_t FlowSensor::_interruptPulseCount = 0;
volatile uint32_t FlowSensor::_lastInterruptTimeMs = 0;

void IRAM_ATTR FlowSensor::onPulseInterrupt() {
  _interruptPulseCount++;
  _lastInterruptTimeMs = millis();
}

FlowSensor::FlowSensor(uint8_t pin, float pulsesPerLitre)
    : _pin(pin),
      _pulsesPerLitre(pulsesPerLitre > 0.0f ? pulsesPerLitre : DEFAULT_PULSES_PER_LITRE),
      _flowRateLpm(0.0f),
      _totalLitres(0.0f),
      _isPlausible(true),
      _lastPulseTimeMs(0),
      _lastTotalPulseCount(0) {}

void FlowSensor::begin() {
  // Enable internal pull-up so open-collector Hall sensor works directly or with external 10k
  pinMode(_pin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(_pin), FlowSensor::onPulseInterrupt, RISING);
}

uint32_t FlowSensor::getCumulativePulses() const {
  noInterrupts();
  uint32_t count = _interruptPulseCount;
  interrupts();
  return count;
}

float FlowSensor::calculateFlowRateLpm(uint32_t pulsesInInterval, uint32_t intervalMs, float pulsesPerLitre) {
  if (intervalMs == 0 || pulsesPerLitre <= 0.0f) {
    return 0.0f;
  }
  float freqHz = (static_cast<float>(pulsesInInterval) * 1000.0f) / static_cast<float>(intervalMs);
  float lpm = (freqHz * 60.0f) / pulsesPerLitre;
  return lpm < 0.0f ? 0.0f : lpm;
}

float FlowSensor::calculateVolumeLitres(uint32_t cumulativePulses, float pulsesPerLitre) {
  if (pulsesPerLitre <= 0.0f) {
    return 0.0f;
  }
  return static_cast<float>(cumulativePulses) / pulsesPerLitre;
}

void FlowSensor::update(uint32_t deltaMs) {
  if (deltaMs == 0) return;

  uint32_t currentTotal = getCumulativePulses();
  uint32_t deltaPulses = 0;

  if (currentTotal >= _lastTotalPulseCount) {
    deltaPulses = currentTotal - _lastTotalPulseCount;
  } else {
    // 32-bit counter overflow protection
    deltaPulses = (0xFFFFFFFFUL - _lastTotalPulseCount) + currentTotal + 1;
  }
  _lastTotalPulseCount = currentTotal;

  if (deltaPulses > 0) {
    _lastPulseTimeMs = millis();
  }

  _flowRateLpm = calculateFlowRateLpm(deltaPulses, deltaMs, _pulsesPerLitre);
  if (_flowRateLpm > MAX_PLAUSIBLE_LPM) {
    _isPlausible = false;
  } else {
    _isPlausible = true;
  }
  _totalLitres = calculateVolumeLitres(currentTotal, _pulsesPerLitre);
}

void FlowSensor::resetTotalLitres() {
  noInterrupts();
  _interruptPulseCount = 0;
  interrupts();
  _lastTotalPulseCount = 0;
  _totalLitres = 0.0f;
  _flowRateLpm = 0.0f;
}

void FlowSensor::setTotalLitres(float litres) {
  if (litres < 0.0f) litres = 0.0f;
  uint32_t pulses = static_cast<uint32_t>(litres * _pulsesPerLitre);
  noInterrupts();
  _interruptPulseCount = pulses;
  interrupts();
  _lastTotalPulseCount = pulses;
  _totalLitres = litres;
}

} // namespace SmartTank
