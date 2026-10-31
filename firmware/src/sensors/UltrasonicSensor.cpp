#include "UltrasonicSensor.h"
#include "../config/AppConfig.h"

namespace SmartTank {

UltrasonicSensor::UltrasonicSensor(uint8_t trigPin, uint8_t echoPin,
                                   float emptyDistanceCm, float fullDistanceCm)
    : _trigPin(trigPin),
      _echoPin(echoPin),
      _emptyDistanceCm(emptyDistanceCm),
      _fullDistanceCm(fullDistanceCm),
      _lastDistanceCm(-1.0f),
      _lastLevelPercent(-1.0f),
      _lastMeasureTimeMs(0),
      _status(UltrasonicStatus::INITIALIZING) {}

void UltrasonicSensor::setCalibration(float emptyDistanceCm, float fullDistanceCm) {
  _emptyDistanceCm = emptyDistanceCm;
  _fullDistanceCm = fullDistanceCm;
  if (_emptyDistanceCm <= _fullDistanceCm || _fullDistanceCm < MIN_VALID_DISTANCE_CM) {
    _status = UltrasonicStatus::CONFIG_ERROR;
  } else if (_status == UltrasonicStatus::CONFIG_ERROR) {
    _status = UltrasonicStatus::INITIALIZING;
  }
}

void UltrasonicSensor::begin() {
  pinMode(_trigPin, OUTPUT);
  pinMode(_echoPin, INPUT);
  digitalWrite(_trigPin, LOW);

  // Validate configuration geometry
  if (_emptyDistanceCm <= _fullDistanceCm || _fullDistanceCm < MIN_VALID_DISTANCE_CM) {
    _status = UltrasonicStatus::CONFIG_ERROR;
  }
}

float UltrasonicSensor::durationToDistanceCm(unsigned long durationMicros) {
  // Speed of sound in air at 20°C: ~343 m/s = 0.0343 cm/microsecond
  // Round trip distance = (duration * 0.0343) / 2
  return (static_cast<float>(durationMicros) * 0.0343f) / 2.0f;
}

float UltrasonicSensor::calculateLevelPercent(float distanceCm, float emptyDistanceCm, float fullDistanceCm, bool& isValid) {
  if (emptyDistanceCm <= fullDistanceCm) {
    isValid = false;
    return -1.0f;
  }

  // Reject physically impossible negative or out-of-range (>400cm) readings
  if (distanceCm < 0.0f || distanceCm > MAX_VALID_DISTANCE_CM) {
    isValid = false;
    return -1.0f;
  }

  isValid = true;

  // When hand/water is at or closer than full threshold (<= 15cm), tank is 100% FULL
  if (distanceCm <= fullDistanceCm) {
    return 100.0f;
  }

  // When distance is at or further than empty threshold (>= 100cm), tank is 0% EMPTY
  if (distanceCm >= emptyDistanceCm) {
    return 0.0f;
  }

  // Linear proportional level between empty (0%) and full (100%)
  float level = 100.0f * (emptyDistanceCm - distanceCm) / (emptyDistanceCm - fullDistanceCm);

  if (level < 0.0f) level = 0.0f;
  if (level > 100.0f) level = 100.0f;
  return level;
}

float UltrasonicSensor::readRawDistance() {
  // Clear trigger
  digitalWrite(_trigPin, LOW);
  delayMicroseconds(4);

  // 10 microsecond trigger pulse
  digitalWrite(_trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(_trigPin, LOW);

  // Acoustic range ~400 cm -> 25000 microseconds round-trip at 343 m/s
  constexpr unsigned long MAX_ECHO_TIMEOUT_US = 25000;
  unsigned long duration = pulseIn(_echoPin, HIGH, MAX_ECHO_TIMEOUT_US);

  if (duration == 0) {
    return -1.0f; // Timeout or sensor disconnected
  }

  return durationToDistanceCm(duration);
}

bool UltrasonicSensor::measure() {
  if (_emptyDistanceCm <= _fullDistanceCm) {
    _status = UltrasonicStatus::CONFIG_ERROR;
    _lastDistanceCm = -1.0f;
    _lastLevelPercent = -1.0f;
    return false;
  }

  float distance = readRawDistance();

  if (distance < 0.0f) {
    // If an object/hand was recently close (< 25cm), zero-echo duration indicates
    // the hand/water is touching the transducer face (< 2cm blind zone).
    if (_lastDistanceCm > 0.0f && _lastDistanceCm <= 25.0f) {
      _lastDistanceCm = MIN_VALID_DISTANCE_CM;
      _lastLevelPercent = 100.0f;
      _lastMeasureTimeMs = millis();
      _status = UltrasonicStatus::OK;
      return true;
    }
    _status = UltrasonicStatus::TIMEOUT;
    _lastDistanceCm = -1.0f;
    _lastLevelPercent = -1.0f;
    return false;
  }

  // If distance is closer than physical minimum, clamp to minimum distance
  if (distance < MIN_VALID_DISTANCE_CM) {
    distance = MIN_VALID_DISTANCE_CM;
  }

  bool valid = false;
  float pct = calculateLevelPercent(distance, _emptyDistanceCm, _fullDistanceCm, valid);

  if (!valid) {
    _status = UltrasonicStatus::OUT_OF_RANGE;
    _lastDistanceCm = distance;
    _lastLevelPercent = -1.0f;
    return false;
  }

  _lastDistanceCm = distance;
  _lastLevelPercent = pct;
  _lastMeasureTimeMs = millis();
  _status = UltrasonicStatus::OK;
  return true;
}

const char* UltrasonicSensor::getStatusString() const {
  switch (_status) {
    case UltrasonicStatus::OK: return "OK";
    case UltrasonicStatus::TIMEOUT: return "TIMEOUT";
    case UltrasonicStatus::OUT_OF_RANGE: return "OUT_OF_RANGE";
    case UltrasonicStatus::CONFIG_ERROR: return "CONFIG_ERROR";
    default: return "INITIALIZING";
  }
}

} // namespace SmartTank
