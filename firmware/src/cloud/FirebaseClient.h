#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "../control/PumpController.h"

namespace SmartTank {

struct TelemetryPacket {
  float levelPercent;
  float distanceCm;
  float flowRateLpm;
  float totalLitres;
  float pumpCurrentA;
  const char* pumpState;
  const char* controlMode;
  const char* sensorStatus;
  const char* controllerStatus;
  const char* faultCode;
  bool isLevelValid;
  unsigned long timestampMs;
};

class FirebaseClient {
public:
  FirebaseClient(const String& host, const String& authKey, const String& tankId, const String& deviceUid);

  void begin(const String& wifiSsid, const String& wifiPassword);
  void update(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry);

  bool isWifiConnected() const;
  bool publishTelemetry(const TelemetryPacket& telemetry);
  bool checkAndProcessCommands(PumpController& pumpCtrl);
  bool sendCommandAck(const char* commandId, const char* status, const char* reason = "");
  bool publishAlert(const char* alertType, const char* severity, const char* message);

  bool isStartupBaselineEstablished() const { return _startupBaselineEstablished; }
  const char* getLastProcessedCommandId() const { return _lastProcessedCommandId; }

  void setTankId(const String& tankId) { _tankId = tankId; }
  const String& getTankId() const { return _tankId; }

private:
  String _host;
  String _authKey;
  String _tankId;
  String _deviceUid;

  String _ssid;
  String _pass;

  uint32_t _lastWifiCheckMs;
  uint32_t _lastTelemetryPublishMs;
  uint32_t _lastCommandPollMs;

  char _lastProcessedCommandId[65];
  bool _startupBaselineEstablished;
  bool _ntpConfigured;
  bool _lastWifiConnected;
  uint32_t _lastReconnectAttemptMs;
  SafetyLockout _lastReportedLockout;

  String buildUrl(const String& path) const;
  void maintainWifi(uint32_t currentMillis);
  bool isTimeSynchronized() const;
};

} // namespace SmartTank
