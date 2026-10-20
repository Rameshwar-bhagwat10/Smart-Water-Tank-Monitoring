#pragma once

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include "../config/ConfigManager.h"

namespace SmartTank {

class CaptivePortal {
public:
  CaptivePortal();
  ~CaptivePortal();

  void start(const char* apName = nullptr, const char* apPassword = nullptr);
  void stop();
  void handleClient();
  bool isComplete() const { return _isComplete; }

private:
  DNSServer _dnsServer;
  ESP8266WebServer _server;
  bool _isComplete;
  bool _isRunning;
  String _apName;

  void setupRoutes();
  void handleRoot();
  void handleSave();
  void handleNotFound();
  String buildHtml(const String& scannedOptions);
};

} // namespace SmartTank
