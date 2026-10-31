#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include "../control/PumpController.h"
#include "../cloud/FirebaseClient.h"

namespace SmartTank {

class AlertManager;

class LocalDashboardServer {
public:
  LocalDashboardServer(uint16_t port = 80);

  void begin(const char* tankId = "tank-01");
  void handleClient(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry, AlertManager* alertMgr = nullptr);
  bool hasRecentClient() const { return (_lastClientAccessMs > 0 && (millis() - _lastClientAccessMs < 8000)); }
  uint32_t getLastClientAccessMs() const { return _lastClientAccessMs; }
  void stop();

private:
  ESP8266WebServer _server;
  DNSServer _dnsServer;
  bool _isRunning;
  String _tankId;
  uint32_t _lastClientAccessMs;
  const TelemetryPacket* _lastTelemetry;
  PumpController* _pumpCtrl;
  AlertManager* _alertMgr;

  void setupRoutes();
  void handleRoot();
  void handleApiLive();
  void handleApiCommand();
  void handleNotFound();
  void handleCors();
};

} // namespace SmartTank
