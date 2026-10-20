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
  pinMode(_greenLed, OUTPUT);
  pinMode(_yellowLed, OUTPUT);
  pinMode(_redLed, OUTPUT);
  pinMode(_buzzer, OUTPUT);

  digitalWrite(_greenLed, LOW);
  digitalWrite(_yellowLed, LOW);
  digitalWrite(_redLed, _redActiveLow ? HIGH : LOW);
  digitalWrite(_buzzer, LOW);
}

void AlertManager::triggerChirp(uint16_t durationMs) {
  digitalWrite(_buzzer, HIGH);
  _chirpEndMillis = millis() + durationMs;
}

void AlertManager::update(uint32_t currentMillis, bool wifiConnected, bool pumpRunning, SafetyLockout lockout) {
  // Handle active chirp timer
  if (_chirpEndMillis > 0 && currentMillis >= _chirpEndMillis) {
    digitalWrite(_buzzer, LOW);
    _chirpEndMillis = 0;
  }

  // 500ms toggle for blink patterns
  if (currentMillis - _lastBlinkMillis >= 500) {
    _lastBlinkMillis = currentMillis;
    _blinkState = !_blinkState;
  }

  // Green LED: Solid when Wi-Fi connected, blinking when connecting
  if (wifiConnected) {
    digitalWrite(_greenLed, HIGH);
  } else {
    digitalWrite(_greenLed, _blinkState ? HIGH : LOW);
  }

  // Yellow LED: Solid when pump relay energized
  digitalWrite(_yellowLed, pumpRunning ? HIGH : LOW);

  // Red LED & Buzzer: Active on Safety Lockouts
  if (lockout != SafetyLockout::NONE) {
    bool ledEnergized = _blinkState;
    digitalWrite(_redLed, _redActiveLow ? (ledEnergized ? LOW : HIGH) : (ledEnergized ? HIGH : LOW));
    // Beep buzzer intermittently on critical lockout
    if (_chirpEndMillis == 0) {
      digitalWrite(_buzzer, _blinkState ? HIGH : LOW);
    }
  } else {
    digitalWrite(_redLed, _redActiveLow ? HIGH : LOW);
  }
}

} // namespace SmartTank
