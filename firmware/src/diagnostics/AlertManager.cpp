#include "AlertManager.h"

namespace SmartTank {

AlertManager::AlertManager(uint8_t greenLedPin, uint8_t yellowLedPin, uint8_t redLedPin, uint8_t buzzerPin, bool redActiveLow)
    : _greenLed(greenLedPin),
      _yellowLed(yellowLedPin),
      _redLed(redLedPin),
      _buzzer(buzzerPin),
      _redActiveLow(redActiveLow),
      _lastBlinkMillis(0),
      _blinkState(false),
      _chirpEndMillis(0) {}

void AlertManager::begin() {
  if (_greenLed != 255) {
    pinMode(_greenLed, OUTPUT);
    digitalWrite(_greenLed, LOW);
  }
  if (_yellowLed != 255) {
    pinMode(_yellowLed, OUTPUT);
    digitalWrite(_yellowLed, LOW);
  }
  if (_redLed != 255) {
    pinMode(_redLed, OUTPUT);
    digitalWrite(_redLed, _redActiveLow ? HIGH : LOW);
  }
  if (_buzzer != 255) {
    pinMode(_buzzer, OUTPUT);
    digitalWrite(_buzzer, LOW);
  }
}

void AlertManager::triggerChirp(uint16_t durationMs) {
  playTone(2700, durationMs);
}

void AlertManager::playTone(uint16_t frequencyHz, uint16_t durationMs) {
  if (_buzzer == 255 || frequencyHz == 0) return;
  uint32_t halfPeriodUs = 1000000UL / (frequencyHz * 2);
  uint32_t cycles = (static_cast<uint32_t>(durationMs) * 1000UL) / (halfPeriodUs * 2);

  for (uint32_t i = 0; i < cycles; ++i) {
    digitalWrite(_buzzer, HIGH);
    delayMicroseconds(halfPeriodUs);
    digitalWrite(_buzzer, LOW);
    delayMicroseconds(halfPeriodUs);
    if ((i & 0x7F) == 0) {
      ESP.wdtFeed();
    }
  }
}

void AlertManager::update(uint32_t currentMillis, bool wifiConnected, bool pumpRunning, SafetyLockout lockout) {
  // 500ms toggle for blink patterns
  if (currentMillis - _lastBlinkMillis >= 500) {
    _lastBlinkMillis = currentMillis;
    _blinkState = !_blinkState;
  }

  // Green LED: Solid when Wi-Fi connected, blinking when connecting
  if (_greenLed != 255) {
    if (wifiConnected) {
      digitalWrite(_greenLed, HIGH);
    } else {
      digitalWrite(_greenLed, _blinkState ? HIGH : LOW);
    }
  }

  // Yellow LED: Solid when pump relay energized
  if (_yellowLed != 255) {
    digitalWrite(_yellowLed, pumpRunning ? HIGH : LOW);
  }

  // Red LED & Buzzer: Active on Safety Lockouts
  if (_redLed != 255) {
    if (lockout != SafetyLockout::NONE) {
      bool ledEnergized = _blinkState;
      digitalWrite(_redLed, _redActiveLow ? (ledEnergized ? LOW : HIGH) : (ledEnergized ? HIGH : LOW));
    } else {
      digitalWrite(_redLed, _redActiveLow ? HIGH : LOW);
    }
  }

  // Buzzer beep intermittently on critical safety lockout
  if (_buzzer != 255) {
    if (lockout != SafetyLockout::NONE) {
      if (_blinkState) {
        playTone(2500, 40);
      } else {
        digitalWrite(_buzzer, LOW);
      }
    } else {
      digitalWrite(_buzzer, LOW);
    }
  }
}

} // namespace SmartTank
