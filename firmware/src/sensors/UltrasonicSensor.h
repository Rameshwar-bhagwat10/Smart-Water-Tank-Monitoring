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
  uint32_t getLastMeasureTimeMs() const { return _lastMeasureTimeMs; }
  bool isStale(uint32_t currentMillis, uint32_t maxAgeMs = 5000) const {
    if (_lastMeasureTimeMs == 0) return true;
    return (currentMillis - _lastMeasureTimeMs) > maxAgeMs;
  }

  void setCalibration(float emptyDistanceCm, float fullDistanceCm);
  float getEmptyDistanceCm() const { return _emptyDistanceCm; }
  float getFullDistanceCm() const { return _fullDistanceCm; }

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
  uint32_t _lastMeasureTimeMs;
  UltrasonicStatus _status;

  float readRawDistance();
};

} // namespace SmartTank
