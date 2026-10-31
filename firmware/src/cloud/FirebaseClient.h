#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <vector>
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
  bool waterProbeDetected;
  int rawAdc;
  uint32_t flowPulses;
  unsigned long timestampMs;
};

struct TankNode {
  String id;
  char lastProcessedCommandId[65];
  bool baselineEstablished;
  String mode;
  String pumpState;
  float levelPercent;
  float distanceCm;
  float flowRateLpm;
  float totalLitres;
  float pumpCurrentA;
  String status;
};

class AlertManager;

class FirebaseClient {
public:
  FirebaseClient(const String& host, const String& authKey, const String& defaultTankId, const String& deviceUid);

  void begin(const String& wifiSsid, const String& wifiPassword);
  void update(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry, AlertManager* alertMgr = nullptr);

  bool isWifiConnected() const;
  bool publishTelemetry(const TelemetryPacket& telemetry);
  bool publishTelemetryForTank(const String& tankId, const TelemetryPacket& telemetry, const String& mode, const String& pumpState);
  bool checkAndProcessCommands(PumpController& pumpCtrl, AlertManager* alertMgr = nullptr);
  bool sendCommandAck(const char* tankId, const char* commandId, const char* status, const char* reason = "");
  bool publishAlert(const char* tankId, const char* alertType, const char* severity, const char* message);

  void addTank(const String& tankId);
  size_t getTankCount() const { return _tanks.size(); }
  const TankNode& getTank(size_t index) const { return _tanks[index]; }

  void setTankId(const String& tankId);
  const String& getTankId() const { return _primaryTankId; }

private:
  String _host;
  String _authKey;
  String _primaryTankId;
  String _deviceUid;

  String _ssid;
  String _pass;

  uint32_t _lastWifiCheckMs;
  uint32_t _lastTelemetryPublishMs;
  uint32_t _lastCommandPollMs;

  bool _ntpConfigured;
  bool _lastWifiConnected;
  uint32_t _lastReconnectAttemptMs;
  uint32_t _lastFleetScanMs;
  SafetyLockout _lastReportedLockout;

  std::vector<TankNode> _tanks;

  String buildUrl(const String& path) const;
  void maintainWifi(uint32_t currentMillis);
  void scanFleetForNewTanks();
  bool isTimeSynchronized() const;
};

} // namespace SmartTank
