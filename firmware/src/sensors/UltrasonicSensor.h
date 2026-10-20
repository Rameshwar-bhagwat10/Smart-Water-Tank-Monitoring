#pragma once

#include <Arduino.h>

namespace SmartTank {

enum class UltrasonicStatus {
  OK,
  TIMEOUT,
  OUT_OF_RANGE,
  CONFIG_ERROR,
  INITIALIZING
};

class UltrasonicSensor {
public:
  UltrasonicSensor(uint8_t trigPin, uint8_t echoPin,
                   float emptyDistanceCm, float fullDistanceCm);

  void begin();
  bool measure();

  float getDistanceCm() const { return _lastDistanceCm; }
  float getLevelPercent() const { return _lastLevelPercent; }
  UltrasonicStatus getStatus() const { return _status; }
  const char* getStatusString() const;
  bool isReadingValid() const { return _status == UltrasonicStatus::OK; }

  // Static pure calculation functions (testable independently)
  static float calculateLevelPercent(float distanceCm, float emptyDistanceCm, float fullDistanceCm, bool& isValid);
  static float durationToDistanceCm(unsigned long durationMicros);

private:
  uint8_t _trigPin;
  uint8_t _echoPin;
  float _emptyDistanceCm;
  float _fullDistanceCm;

  float _lastDistanceCm;
  float _lastLevelPercent;
  UltrasonicStatus _status;

  float readRawDistance();
};

} // namespace SmartTank
