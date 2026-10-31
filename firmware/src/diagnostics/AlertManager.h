#pragma once

#include <Arduino.h>
#include "../control/PumpController.h"

namespace SmartTank {

class AlertManager {
public:
  AlertManager(uint8_t greenLedPin, uint8_t yellowLedPin, uint8_t redLedPin, uint8_t buzzerPin, bool redActiveLow = true);

  void begin();
  void update(uint32_t currentMillis, bool wifiConnected, bool pumpRunning, SafetyLockout lockout);
  void triggerChirp(uint16_t durationMs = 80);
  void triggerFullTankAlarm();
  void triggerModeSwitchChirp();
  void playTone(uint16_t frequencyHz = 2500, uint16_t durationMs = 1000);

private:
  uint8_t _greenLed;
  uint8_t _yellowLed;
  uint8_t _redLed;
  uint8_t _buzzer;
  bool _redActiveLow;

  uint32_t _lastBlinkMillis;
  bool _blinkState;
  uint32_t _chirpEndMillis;
};

} // namespace SmartTank
