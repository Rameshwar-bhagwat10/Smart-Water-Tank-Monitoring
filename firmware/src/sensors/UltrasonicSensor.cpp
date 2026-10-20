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

  if (distanceCm < MIN_VALID_DISTANCE_CM || distanceCm > MAX_VALID_DISTANCE_CM) {
    isValid = false;
    return -1.0f;
  }

  isValid = true;
  float level = 100.0f * (emptyDistanceCm - distanceCm) / (emptyDistanceCm - fullDistanceCm);

  // Clamp within 0% to 100%
  if (level < 0.0f) level = 0.0f;
  if (level > 100.0f) level = 100.0f;
  return level;
}

float UltrasonicSensor::readRawDistance() {
  // Clear trigger
  digitalWrite(_trigPin, LOW);
  delayMicroseconds(2);

  // 10 microsecond pulse
  digitalWrite(_trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(_trigPin, LOW);

  // Max range ~250 cm -> ~14500 microseconds max round-trip
  constexpr unsigned long MAX_ECHO_TIMEOUT_US = 15000;
  unsigned long duration = pulseIn(_echoPin, HIGH, MAX_ECHO_TIMEOUT_US);

  if (duration == 0) {
    return -1.0f; // Timeout
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

  // Quick 1st sample: if disconnected, abort immediately to avoid blocking CPU
  float d0 = readRawDistance();
  if (d0 < 0) {
    _status = UltrasonicStatus::TIMEOUT;
    _lastDistanceCm = -1.0f;
    _lastLevelPercent = -1.0f;
    return false;
  }

  // If sensor is connected, take 2 more samples for median filtering
  float samples[3];
  samples[0] = d0;
  int validCount = 1;

  for (int i = 1; i < 3; ++i) {
    delay(10);
    float d = readRawDistance();
    if (d >= MIN_VALID_DISTANCE_CM && d <= MAX_VALID_DISTANCE_CM) {
      samples[validCount++] = d;
    }
  }

  if (validCount == 0) {
    _status = UltrasonicStatus::TIMEOUT;
    _lastDistanceCm = -1.0f;
    _lastLevelPercent = -1.0f;
    return false;
  }

  // Select median or average of valid samples
  float distance = 0.0f;
  if (validCount == 1) {
    distance = samples[0];
  } else if (validCount == 2) {
    distance = (samples[0] + samples[1]) / 2.0f;
  } else {
    // Simple sort for 3 elements
    if (samples[0] > samples[1]) std::swap(samples[0], samples[1]);
    if (samples[1] > samples[2]) std::swap(samples[1], samples[2]);
    if (samples[0] > samples[1]) std::swap(samples[0], samples[1]);
    distance = samples[1]; // Median
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
