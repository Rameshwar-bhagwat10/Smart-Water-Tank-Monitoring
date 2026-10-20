#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include "../control/PumpController.h"
#include "../cloud/FirebaseClient.h"
#include "../config/ConfigManager.h"

namespace SmartTank {

class LocalDashboardServer {
public:
  LocalDashboardServer(uint16_t port = 80);

  void begin(const char* tankId);
  void handleClient(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry);
  void stop();

private:
  ESP8266WebServer _server;
  DNSServer _dnsServer;
  bool _isRunning;
  String _tankId;
  const TelemetryPacket* _lastTelemetry;
  PumpController* _pumpCtrl;

  // SEC-002: Session Token & Local API Security
  String _sessionToken;
  uint32_t _sessionExpiryMs;
  uint8_t _failedAuthAttempts;
  uint32_t _authLockoutUntilMs;

  bool checkAuthentication(const String& token, const String& pin);
  void recordFailedAuth();
  void resetFailedAuth();

  void setupRoutes();
  void handleRoot();
  void handleApiLive();
  void handleApiLogin();
  void handleApiCommand();
  void handleApiWifiSetup();
  void handleSetupPage();
  void handleApiScanWifi();
  void handleNotFound();
  void handleCors();

  String buildDashboardHtml();
  String buildSetupHtml();
};

} // namespace SmartTank
