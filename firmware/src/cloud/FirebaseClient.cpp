#include "FirebaseClient.h"
#include "../config/AppConfig.h"
#include "../diagnostics/AlertManager.h"

namespace SmartTank {

FirebaseClient::FirebaseClient(const String& host, const String& authKey, const String& defaultTankId, const String& deviceUid)
  : _host(host),
    _authKey(authKey),
    _primaryTankId(defaultTankId.length() > 0 ? defaultTankId : "tank-01"),
    _deviceUid(deviceUid),
    _ssid(""),
    _pass(""),
    _lastWifiCheckMs(0),
    _lastTelemetryPublishMs(0),
    _lastCommandPollMs(0),
    _ntpConfigured(false),
    _lastWifiConnected(false),
    _lastReconnectAttemptMs(0),
    _lastFleetScanMs(0),
    _lastReportedLockout(SafetyLockout::NONE) {
  
  // Register physical controller primary tank initially.
  // All other tanks will be loaded dynamically from Firebase only if they exist in the database!
  addTank(_primaryTankId);
}

void FirebaseClient::addTank(const String& tankId) {
  for (size_t i = 0; i < _tanks.size(); i++) {
    if (_tanks[i].id == tankId) return;
  }
  TankNode node;
  node.id = tankId;
  node.lastProcessedCommandId[0] = '\0';
  node.baselineEstablished = false;
  node.mode = "AUTO";
  node.levelPercent = 0.0f;
  node.distanceCm = 0.0f;
  node.totalLitres = 0.0f;
  node.flowRateLpm = 0.0f;
  node.pumpCurrentA = 0.0f;
  node.status = "IDLE";
  _tanks.push_back(node);
}

void FirebaseClient::setTankId(const String& tankId) {
  _primaryTankId = tankId;
  addTank(tankId);
}

void FirebaseClient::begin(const String& wifiSsid, const String& wifiPassword) {
  _ssid = wifiSsid;
  _pass = wifiPassword;
  _lastWifiConnected = (WiFi.status() == WL_CONNECTED);

  // Preserve WIFI_AP_STA mode so the local SoftAP remains active alongside station Wi-Fi
  if (WiFi.getMode() != WIFI_AP_STA) {
    WiFi.mode(WIFI_AP_STA);
  }
  WiFi.setAutoReconnect(true);

  if (_ssid.length() > 0) {
    WiFi.begin(_ssid.c_str(), _pass.c_str());
  }
}

bool FirebaseClient::isWifiConnected() const {
  return (WiFi.status() == WL_CONNECTED);
}

bool FirebaseClient::isTimeSynchronized() const {
  time_t now = time(nullptr);
  return (now > 1700000000); // Valid UTC timestamp (2023+)
}

void FirebaseClient::maintainWifi(uint32_t currentMillis) {
  bool currentConnected = (WiFi.status() == WL_CONNECTED);

  // Transition: Just Connected
  if (currentConnected && !_lastWifiConnected) {
    _lastWifiConnected = true;
    Serial.println();
    Serial.println(F("========================================================="));
    Serial.printf("[Wi-Fi] SUCCESS: Connected to '%s'!\n", _ssid.c_str());
    Serial.printf("[Wi-Fi] Station IP : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[Wi-Fi] Signal RSSI: %d dBm\n", WiFi.RSSI());
    Serial.println(F("[Cloud] Online operations ACTIVATED: Monitoring multi-tank fleet."));
    Serial.println(F("========================================================="));

    if (!_ntpConfigured) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      _ntpConfigured = true;
      Serial.println(F("[Cloud] Synchronizing network time via NTP (UTC)..."));
    }

    // Discover only the tanks that currently exist in Firebase RTDB
    scanFleetForNewTanks();
  }
  // Transition: Just Disconnected
  else if (!currentConnected && _lastWifiConnected) {
    _lastWifiConnected = false;
    Serial.println();
    Serial.println(F("========================================================="));
    Serial.printf("[Wi-Fi] Disconnected from '%s'!\n", _ssid.c_str());
    Serial.println(F("[Cloud] Cloud operations PAUSED. Local services remain active."));
    Serial.println(F("[Local] Dashboard accessible at http://192.168.4.1"));
    Serial.println(F("========================================================="));
  }

  // Graceful periodic background reconnect attempt (every 15s)
  if (!currentConnected && _ssid.length() > 0) {
    if (currentMillis - _lastReconnectAttemptMs >= 15000) {
      _lastReconnectAttemptMs = currentMillis;
      Serial.printf("[Wi-Fi] Background reconnect attempt to '%s' (Status: %d)...\n", _ssid.c_str(), (int)WiFi.status());
      WiFi.reconnect();
    }
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

bool FirebaseClient::publishTelemetryForTank(const String& tankId, const TelemetryPacket& telemetry, const String& mode, const String& pumpState) {
  if (!isWifiConnected()) return false;

  String endpoint = "/tanks/" + tankId + "/live";
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  JsonDocument doc;
  doc["levelPercent"] = serialized(String((telemetry.levelPercent >= 0.0f) ? telemetry.levelPercent : 0.0f, 1));
  doc["distanceCm"] = serialized(String((telemetry.distanceCm >= 0.0f) ? telemetry.distanceCm : 0.0f, 1));
  doc["flowRateLpm"] = serialized(String((telemetry.flowRateLpm >= 0.0f) ? telemetry.flowRateLpm : 0.0f, 1));
  doc["totalLitres"] = serialized(String((telemetry.totalLitres >= 0.0f) ? telemetry.totalLitres : 0.0f, 2));
  doc["pumpCurrentA"] = serialized(String((telemetry.pumpCurrentA >= 0.0f) ? telemetry.pumpCurrentA : 0.0f, 2));
  doc["pumpState"] = (pumpState.length() > 0) ? pumpState.c_str() : telemetry.pumpState;
  doc["controlMode"] = (mode.length() > 0) ? mode.c_str() : telemetry.controlMode;
  doc["sensorStatus"] = telemetry.sensorStatus;
  if (telemetry.controllerStatus != nullptr) {
    doc["controllerStatus"] = telemetry.controllerStatus;
  }
  if (telemetry.faultCode != nullptr) {
    doc["faultCode"] = telemetry.faultCode;
  }
  doc["waterProbe"] = telemetry.waterProbeDetected;
  doc["rawAdc"] = telemetry.rawAdc;
  doc["wifiConnected"] = true;
  time_t nowSec = time(nullptr);
  double timeMs = (nowSec > 1700000000) ? ((double)nowSec * 1000.0) : (double)millis();
  doc["updatedAt"] = timeMs;

  String payload;
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(2500);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  return (httpCode >= 200 && httpCode < 300);
}

bool FirebaseClient::publishTelemetry(const TelemetryPacket& telemetry) {
  return publishTelemetryForTank(_primaryTankId, telemetry, "", "");
}

bool FirebaseClient::checkAndProcessCommands(PumpController& pumpCtrl, AlertManager* alertMgr) {
  if (!isWifiConnected()) return false;

  bool anyProcessed = false;

  // Ultra-Fast Path: Direct single-query for physical hardware tank
  TankNode* pNode = nullptr;
  for (size_t i = 0; i < _tanks.size(); i++) {
    if (_tanks[i].id == _primaryTankId) {
      pNode = &_tanks[i];
      break;
    }
  }
  if (!pNode && _tanks.size() > 0) pNode = &_tanks[0];
  if (!pNode) return false;

  TankNode& node = *pNode;
  String endpoint = "/tanks/" + node.id + "/commands";
  String url = buildUrl(endpoint);
  if (url.length() == 0) return false;

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(800);

  HTTPClient http;
  http.setReuse(true);
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
      if (!node.baselineEstablished) {
        node.baselineEstablished = true;
      }
      return false;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) return false;

    const char* cmdId = doc["commandId"] | "";
    const char* reqMode = doc["requestedMode"] | "";
    const char* reqState = doc["requestedPumpState"] | "";
    const char* reqAction = doc["action"] | "";
    const char* reqBy = doc["requestedBy"] | "CloudUser";
    double requestedAt = doc["requestedAt"] | 0.0;

    if (strlen(cmdId) == 0) {
      if (!node.baselineEstablished) {
        node.baselineEstablished = true;
      }
      return false;
    }

    // Baseline establishment on startup (avoids replaying historical commands on boot)
    if (!node.baselineEstablished) {
      strncpy(node.lastProcessedCommandId, cmdId, sizeof(node.lastProcessedCommandId) - 1);
      node.lastProcessedCommandId[sizeof(node.lastProcessedCommandId) - 1] = '\0';
      node.baselineEstablished = true;
      node.mode = reqMode;
      node.pumpState = reqState;
      return false;
    }

    // Deduplication check
    if (strcmp(node.lastProcessedCommandId, cmdId) == 0) {
      return false;
    }

    // TTL Expiry Check (60s)
    if (isTimeSynchronized() && requestedAt > 0.0) {
      time_t nowSec = time(nullptr);
      uint64_t nowMs = (uint64_t)nowSec * 1000ULL;
      uint64_t cmdReqMs = (uint64_t)requestedAt;
      if (nowMs > cmdReqMs && (nowMs - cmdReqMs) > 60000ULL) {
        sendCommandAck(node.id.c_str(), cmdId, "REJECTED", "Command expired: older than 60s TTL limit");
        strncpy(node.lastProcessedCommandId, cmdId, sizeof(node.lastProcessedCommandId) - 1);
        node.lastProcessedCommandId[sizeof(node.lastProcessedCommandId) - 1] = '\0';
        return false;
      }
    }

    // Acknowledge receipt
    sendCommandAck(node.id.c_str(), cmdId, "RECEIVED", "Command received by edge controller");

    // Print High-Visibility Command Card on Serial
    Serial.println();
    Serial.println(F("╔════════════════════════════════════════════════════════════════════╗"));
    Serial.printf(  "║               ⚡ CLOUD COMMAND RECEIVED: [%s]                 \n", node.id.c_str());
    Serial.println(F("╠════════════════════════════════════════════════════════════════════╣"));
    Serial.printf(  "║  Target Tank  : %-50s ║\n", node.id.c_str());
    Serial.printf(  "║  Command ID   : %-50s ║\n", cmdId);
    Serial.printf(  "║  Mode Target  : %-50s ║\n", reqMode);
    Serial.printf(  "║  Pump Request : %-50s ║\n", reqState);
    Serial.printf(  "║  Requested By : %-50s ║\n", reqBy);

    // Check for direct Buzzer Test command
    if (strcmp(reqAction, "BEEP") == 0 || strcmp(reqState, "BEEP") == 0) {
      Serial.println(F("║  Action       : APPLIED (Buzzer 1000ms Test Beep)                  ║"));
      sendCommandAck(node.id.c_str(), cmdId, "APPLIED", "Buzzer beeped 1000ms");
      if (alertMgr) {
        alertMgr->playTone(2500, 1000);
      }
      Serial.println(F("╚════════════════════════════════════════════════════════════════════╝"));
      Serial.println();
      strncpy(node.lastProcessedCommandId, cmdId, sizeof(node.lastProcessedCommandId) - 1);
      node.lastProcessedCommandId[sizeof(node.lastProcessedCommandId) - 1] = '\0';
      return true;
    }

    // Apply Command
    node.mode = reqMode;
    node.pumpState = reqState;
    ControlMode targetMode = (strcmp(reqMode, "MANUAL") == 0) ? ControlMode::MANUAL : ControlMode::AUTO;
    bool reqPumpOn = (strcmp(reqState, "ON") == 0);

    if (targetMode == ControlMode::MANUAL) {
      pumpCtrl.requestMode(ControlMode::MANUAL);
      CommandResult res = pumpCtrl.requestManualPump(reqPumpOn, millis());
      if (res.accepted) {
        node.status = reqPumpOn ? "MANUAL_FILLING" : "STANDBY";
        Serial.printf("║  Action       : APPLIED (Relay %s)%-32s ║\n", reqPumpOn ? "ON" : "OFF", "");
        sendCommandAck(node.id.c_str(), cmdId, "APPLIED", "Relay actuated");
        if (alertMgr) {
          alertMgr->playTone(2500, reqPumpOn ? 600 : 300);
        }
      } else {
        node.status = "FAULT";
        Serial.printf("║  Action       : REJECTED (%s)%-25s ║\n", res.reason ? res.reason : "Locked", "");
        sendCommandAck(node.id.c_str(), cmdId, "REJECTED", res.reason ? res.reason : "Safety lockout");
        if (alertMgr) {
          alertMgr->playTone(2000, 100);
          delay(50);
          alertMgr->playTone(2000, 100);
        }
      }
    } else {
      pumpCtrl.requestMode(ControlMode::AUTO);
      node.status = "AUTO_IDLE";
      Serial.println(F("║  Action       : APPLIED (Switched to AUTO Mode)                    ║"));
      sendCommandAck(node.id.c_str(), cmdId, "APPLIED", "Switched to AUTO mode");
      if (alertMgr) {
        alertMgr->playTone(2700, 150);
        delay(50);
        alertMgr->playTone(3000, 150);
      }
    }

    Serial.println(F("╚════════════════════════════════════════════════════════════════════╝"));
    Serial.println();

    strncpy(node.lastProcessedCommandId, cmdId, sizeof(node.lastProcessedCommandId) - 1);
    node.lastProcessedCommandId[sizeof(node.lastProcessedCommandId) - 1] = '\0';
    anyProcessed = true;

  return anyProcessed;
}

bool FirebaseClient::sendCommandAck(const char* tankId, const char* commandId, const char* status, const char* reason) {
  if (!isWifiConnected() || commandId == nullptr || strlen(commandId) == 0) {
    return false;
  }
  const char* targetTank = (tankId != nullptr && strlen(tankId) > 0) ? tankId : _primaryTankId.c_str();

  String endpoint = "/tanks/" + String(targetTank) + "/commandAcks/" + String(commandId);
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
  client.setTimeout(2500);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  return (httpCode >= 200 && httpCode < 300);
}

bool FirebaseClient::publishAlert(const char* tankId, const char* alertType, const char* severity, const char* message) {
  if (!isWifiConnected()) return false;

  const char* targetTank = (tankId != nullptr && strlen(tankId) > 0) ? tankId : _primaryTankId.c_str();
  String alertId = "alt_" + String(millis()) + "_" + String(random(1000, 9999));
  String endpoint = "/tanks/" + String(targetTank) + "/alerts/" + alertId;
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
  client.setTimeout(2500);

  HTTPClient http;
  if (!http.begin(client, url)) {
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(payload);
  http.end();

  return (httpCode >= 200 && httpCode < 300);
}

void FirebaseClient::scanFleetForNewTanks() {
  if (!isWifiConnected()) return;

  int consecutiveNull = 0;

  // Scan candidate tanks from tank-01 to tank-08
  for (int i = 1; i <= 8; i++) {
    char candidateId[12];
    snprintf(candidateId, sizeof(candidateId), "tank-%02d", i);

    bool alreadyTracked = false;
    for (size_t j = 0; j < _tanks.size(); j++) {
      if (_tanks[j].id == candidateId) {
        alreadyTracked = true;
        break;
      }
    }
    if (alreadyTracked) {
      consecutiveNull = 0;
      continue;
    }

    String endpoint = "/tanks/" + String(candidateId) + "/commands";
    String url = buildUrl(endpoint);
    if (url.length() == 0) continue;

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(1500);

    HTTPClient http;
    if (!http.begin(client, url)) continue;

    int httpCode = http.GET();
    if (httpCode == 200) {
      String payload = http.getString();
      if (payload.length() > 0 && payload != "null") {
        addTank(candidateId);
        consecutiveNull = 0;

        // Immediately sync discovered tank's mode and pumpState from DB command
        for (size_t t = 0; t < _tanks.size(); t++) {
          if (_tanks[t].id == candidateId) {
            JsonDocument cmdDoc;
            if (!deserializeJson(cmdDoc, payload)) {
              const char* m = cmdDoc["requestedMode"] | "";
              const char* p = cmdDoc["requestedPumpState"] | "";
              const char* cId = cmdDoc["commandId"] | "";
              if (strlen(m) > 0) _tanks[t].mode = m;
              if (strlen(p) > 0) _tanks[t].pumpState = p;
              if (strlen(cId) > 0) {
                strncpy(_tanks[t].lastProcessedCommandId, cId, sizeof(_tanks[t].lastProcessedCommandId) - 1);
                _tanks[t].baselineEstablished = true;
              }
            }
            break;
          }
        }

        Serial.println();
        Serial.println(F("╔════════════════════════════════════════════════════════════════════╗"));
        Serial.printf(  "║    🚀 NEW USER LOGGED IN — TANK DISCOVERED: [%-7s]                ║\n", candidateId);
        Serial.println(F("║    Added to active Serial Monitor Fleet table!                     ║"));
        Serial.println(F("╚════════════════════════════════════════════════════════════════════╝"));
        Serial.println();
      } else {
        consecutiveNull++;
        if (consecutiveNull >= 2) {
          http.end();
          break; // Stop scanning once 2 consecutive non-existent tanks are hit
        }
      }
    } else {
      consecutiveNull++;
      if (consecutiveNull >= 2) {
        http.end();
        break;
      }
    }
    http.end();
    yield();
  }
}

void FirebaseClient::update(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry, AlertManager* alertMgr) {
  maintainWifi(currentMillis);

  if (!isWifiConnected()) {
    return;
  }

  // Periodic Fleet Auto-Discovery scan (every 60s to avoid blocking local web server)
  if (currentMillis - _lastFleetScanMs >= 60000) {
    _lastFleetScanMs = currentMillis;
    scanFleetForNewTanks();
  }

  // Poll for commands across all registered fleet tanks (ultra-fast 250ms)
  if (currentMillis - _lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    _lastCommandPollMs = currentMillis;
    if (checkAndProcessCommands(pumpCtrl, alertMgr)) {
      // Command executed! Reset timer to immediately push updated pump state to cloud
      _lastTelemetryPublishMs = 0;
    }
  }

  // Publish telemetry for all registered fleet tanks (smooth 1s or instant post-command)
  if (currentMillis - _lastTelemetryPublishMs >= TELEMETRY_PUBLISH_INTERVAL_MS || _lastTelemetryPublishMs == 0) {
    _lastTelemetryPublishMs = currentMillis;
    for (size_t i = 0; i < _tanks.size(); i++) {
      TankNode& node = _tanks[i];
      if (node.id == _primaryTankId) {
        node.levelPercent = (telemetry.levelPercent >= 0.0f) ? telemetry.levelPercent : 0.0f;
        node.distanceCm = (telemetry.distanceCm >= 0.0f) ? telemetry.distanceCm : 0.0f;
        node.flowRateLpm = telemetry.flowRateLpm;
        node.totalLitres = telemetry.totalLitres;
        node.pumpCurrentA = telemetry.pumpCurrentA;
        publishTelemetryForTank(node.id, telemetry, node.mode, pumpCtrl.getPumpStateString());
      } else {
        TelemetryPacket secPkt = telemetry;
        secPkt.controlMode = node.mode.c_str();
        secPkt.pumpState = node.pumpState.c_str();
        secPkt.levelPercent = node.levelPercent;
        secPkt.distanceCm = node.distanceCm;
        secPkt.flowRateLpm = node.flowRateLpm;
        secPkt.totalLitres = node.totalLitres;
        secPkt.pumpCurrentA = node.pumpCurrentA;
        publishTelemetryForTank(node.id, secPkt, node.mode, node.pumpState);
      }
    }
  }

  // Check for newly triggered safety lockouts to publish an alert
  SafetyLockout currentLockout = pumpCtrl.getLockout();
  if (currentLockout != _lastReportedLockout) {
    _lastReportedLockout = currentLockout;
    if (currentLockout == SafetyLockout::HIGH_LEVEL_CUTOFF) {
      publishAlert(_primaryTankId.c_str(), "HIGH_LEVEL_CUTOFF", "WARNING", "Tank water level reached high cutoff (>=95%). Pump stopped.");
    } else if (currentLockout == SafetyLockout::DRY_RUN_DETECTED) {
      publishAlert(_primaryTankId.c_str(), "DRY_RUN_DETECTED", "CRITICAL", "Suspected dry run: zero flow detected while pump running.");
    } else if (currentLockout == SafetyLockout::MAX_RUNTIME_EXCEEDED) {
      publishAlert(_primaryTankId.c_str(), "MAX_RUNTIME_EXCEEDED", "WARNING", "Pump continuous runtime exceeded safety limit (20 min).");
    } else if (currentLockout == SafetyLockout::SENSOR_FAULT) {
      publishAlert(_primaryTankId.c_str(), "SENSOR_FAULT", "CRITICAL", "Ultrasonic sensor uncalibrated or disconnected.");
    }
  }
}

} // namespace SmartTank
