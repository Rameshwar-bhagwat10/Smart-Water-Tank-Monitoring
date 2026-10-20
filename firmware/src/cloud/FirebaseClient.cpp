#include "FirebaseClient.h"
#include "../config/AppConfig.h"

namespace SmartTank {

FirebaseClient::FirebaseClient(const String& host, const String& authKey, const String& tankId, const String& deviceUid)
  : _host(host),
    _authKey(authKey),
    _tankId(tankId),
    _deviceUid(deviceUid),
    _ssid(""),
    _pass(""),
    _lastWifiCheckMs(0),
    _lastTelemetryPublishMs(0),
    _lastCommandPollMs(0),
    _lastReportedLockout(SafetyLockout::NONE) {
  _lastProcessedCommandId[0] = '\0';
}

void FirebaseClient::begin(const String& wifiSsid, const String& wifiPassword) {
  _ssid = wifiSsid;
  _pass = wifiPassword;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  if (_ssid.length() > 0) {
    Serial.printf("[Cloud] Connecting to Wi-Fi SSID: %s (Tank: %s)\n", _ssid.c_str(), _tankId.c_str());
    WiFi.begin(_ssid.c_str(), _pass.c_str());
  }
}

bool FirebaseClient::isWifiConnected() const {
  return (WiFi.status() == WL_CONNECTED);
}

void FirebaseClient::maintainWifi(uint32_t currentMillis) {
  if (currentMillis - _lastWifiCheckMs < 5000) {
    return;
  }
  _lastWifiCheckMs = currentMillis;

  if (WiFi.status() != WL_CONNECTED && _ssid.length() > 0) {
    Serial.println("[Cloud] Wi-Fi link down. Attempting reconnect...");
    WiFi.reconnect();
  }
}

String FirebaseClient::buildUrl(const String& path) const {
  if (_host.length() == 0) {
    return "";
  }

  String url;
  if (_host.startsWith("http://") || _host.startsWith("https://")) {
    url = _host;
  } else {
    url = "https://" + _host;
  }

  if (!url.endsWith("/") && !path.startsWith("/")) {
    url += "/";
  }
  url += path;

  if (!url.endsWith(".json")) {
    url += ".json";
  }

  if (_authKey.length() > 0) {
    url += "?auth=";
    url += _authKey;
  }

  return url;
}

bool FirebaseClient::publishTelemetry(const TelemetryPacket& telemetry) {
  if (!isWifiConnected()) return false;

  String endpoint = "/tanks/" + _tankId + "/live";
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  JsonDocument doc;
  doc["levelPercent"] = serialized(String(telemetry.levelPercent, 1));
  doc["distanceCm"] = serialized(String(telemetry.distanceCm, 1));
  doc["flowRateLpm"] = serialized(String(telemetry.flowRateLpm, 1));
  doc["totalLitres"] = serialized(String(telemetry.totalLitres, 2));
  doc["pumpCurrentA"] = serialized(String(telemetry.pumpCurrentA, 2));
  doc["pumpState"] = telemetry.pumpState;
  doc["controlMode"] = telemetry.controlMode;
  doc["sensorStatus"] = telemetry.sensorStatus;
  doc["wifiConnected"] = true;
  doc["updatedAt"] = (double)telemetry.timestampMs;

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(3000);

  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.println("[Cloud] Failed to begin HTTP client for telemetry");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  if (httpCode >= 200 && httpCode < 300) {
    return true;
  } else {
    Serial.printf("[Cloud] Telemetry PUT to %s returned code: %d\n", endpoint.c_str(), httpCode);
    return false;
  }
}

bool FirebaseClient::checkAndProcessCommands(PumpController& pumpCtrl) {
  if (!isWifiConnected()) return false;

  String endpoint = "/tanks/" + _tankId + "/commands";
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(3000);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  int httpCode = http.GET();
  if (httpCode != 200) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  if (payload.length() == 0 || payload == "null") {
    return false;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[Cloud] Command JSON parse failed: %s\n", err.c_str());
    return false;
  }

  const char* cmdId = doc["commandId"] | "";
  const char* reqMode = doc["requestedMode"] | "";
  const char* reqState = doc["requestedPumpState"] | "";

  if (strlen(cmdId) == 0) {
    return false;
  }

  // Deduplicate: avoid re-processing identical command
  if (strcmp(_lastProcessedCommandId, cmdId) == 0) {
    return false;
  }

  Serial.printf("[Cloud] Received Command for %s: ID=%s, Mode=%s, PumpState=%s\n", _tankId.c_str(), cmdId, reqMode, reqState);

  // Acknowledge receipt
  sendCommandAck(cmdId, "RECEIVED", "Command received by edge controller");

  // Validate mode
  ControlMode targetMode;
  if (strcmp(reqMode, "AUTO") == 0) {
    targetMode = ControlMode::AUTO;
  } else if (strcmp(reqMode, "MANUAL") == 0) {
    targetMode = ControlMode::MANUAL;
  } else {
    sendCommandAck(cmdId, "REJECTED", "Invalid control mode requested");
    strncpy(_lastProcessedCommandId, cmdId, sizeof(_lastProcessedCommandId) - 1);
    return false;
  }

  // Validate state
  bool reqPumpOn = false;
  if (strcmp(reqState, "ON") == 0) {
    reqPumpOn = true;
  } else if (strcmp(reqState, "OFF") == 0) {
    reqPumpOn = false;
  } else {
    sendCommandAck(cmdId, "REJECTED", "Invalid pump state requested");
    strncpy(_lastProcessedCommandId, cmdId, sizeof(_lastProcessedCommandId) - 1);
    return false;
  }

  // Switch mode if requested
  if (pumpCtrl.getMode() != targetMode) {
    pumpCtrl.requestMode(targetMode);
  }

  // Apply manual state if in manual mode
  if (targetMode == ControlMode::MANUAL) {
    CommandResult cmdRes = pumpCtrl.requestManualPump(reqPumpOn, millis());
    if (!cmdRes.accepted) {
      sendCommandAck(cmdId, "REJECTED", cmdRes.reason ? cmdRes.reason : "Safety interlock lockout");
      strncpy(_lastProcessedCommandId, cmdId, sizeof(_lastProcessedCommandId) - 1);
      return false;
    }
  }

  sendCommandAck(cmdId, "APPLIED", "Command successfully applied to relay output");
  strncpy(_lastProcessedCommandId, cmdId, sizeof(_lastProcessedCommandId) - 1);
  return true;
}

bool FirebaseClient::sendCommandAck(const char* commandId, const char* status, const char* reason) {
  if (!isWifiConnected() || commandId == nullptr || strlen(commandId) == 0) {
    return false;
  }

  String endpoint = "/tanks/" + _tankId + "/commandAcks/" + String(commandId);
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  JsonDocument doc;
  doc["commandId"] = commandId;
  doc["status"] = status;
  doc["appliedAt"] = (double)millis();
  if (reason != nullptr && strlen(reason) > 0) {
    doc["reason"] = reason;
  }

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(3000);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  Serial.printf("[Cloud] CommandAck %s sent with status: %s (HTTP %d)\n", commandId, status, httpCode);
  return (httpCode >= 200 && httpCode < 300);
}

bool FirebaseClient::publishAlert(const char* alertType, const char* severity, const char* message) {
  if (!isWifiConnected()) return false;

  String alertId = "alt_" + String(millis()) + "_" + String(random(1000, 9999));
  String endpoint = "/tanks/" + _tankId + "/alerts/" + alertId;
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  JsonDocument doc;
  doc["alertId"] = alertId;
  doc["createdAt"] = (double)millis();
  doc["severity"] = severity;
  doc["type"] = alertType;
  doc["message"] = message;
  doc["acknowledged"] = false;

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(3000);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  Serial.printf("[Cloud] Alert %s published: %s (HTTP %d)\n", alertType, message, httpCode);
  return (httpCode >= 200 && httpCode < 300);
}

void FirebaseClient::update(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry) {
  maintainWifi(currentMillis);

  if (!isWifiConnected()) {
    return;
  }

  // Poll for commands
  if (currentMillis - _lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    _lastCommandPollMs = currentMillis;
    checkAndProcessCommands(pumpCtrl);
  }

  // Publish telemetry
  if (currentMillis - _lastTelemetryPublishMs >= TELEMETRY_PUBLISH_INTERVAL_MS) {
    _lastTelemetryPublishMs = currentMillis;
    publishTelemetry(telemetry);
  }

  // Check for newly triggered safety lockouts to publish an alert
  SafetyLockout currentLockout = pumpCtrl.getLockout();
  if (currentLockout != _lastReportedLockout) {
    _lastReportedLockout = currentLockout;
    if (currentLockout == SafetyLockout::HIGH_LEVEL_CUTOFF) {
      publishAlert("HIGH_LEVEL_CUTOFF", "WARNING", "Tank water level reached high cutoff (>=95%). Pump stopped.");
    } else if (currentLockout == SafetyLockout::DRY_RUN_DETECTED) {
      publishAlert("DRY_RUN_DETECTED", "CRITICAL", "Suspected dry run: zero flow detected while pump running.");
    } else if (currentLockout == SafetyLockout::MAX_RUNTIME_EXCEEDED) {
      publishAlert("MAX_RUNTIME_EXCEEDED", "WARNING", "Pump continuous runtime exceeded safety limit (20 min).");
    } else if (currentLockout == SafetyLockout::SENSOR_FAULT) {
      publishAlert("SENSOR_FAULT", "CRITICAL", "Ultrasonic sensor failed or returned invalid readings.");
    }
  }
}

} // namespace SmartTank
