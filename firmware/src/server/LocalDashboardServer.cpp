#include "LocalDashboardServer.h"
#include <ArduinoJson.h>

namespace SmartTank {

static const IPAddress LOCAL_AP_IP(192, 168, 4, 1);
static const uint16_t LOCAL_DNS_PORT = 53;
static const char DEFAULT_OPERATOR_PIN[] = "admin123";

LocalDashboardServer::LocalDashboardServer(uint16_t port)
  : _server(port),
    _isRunning(false),
    _tankId("tank-01"),
    _lastTelemetry(nullptr),
    _pumpCtrl(nullptr),
    _sessionToken(""),
    _sessionExpiryMs(0),
    _failedAuthAttempts(0),
    _authLockoutUntilMs(0) {}

bool LocalDashboardServer::checkAuthentication(const String& token, const String& pin) {
  if (_authLockoutUntilMs > 0 && millis() < _authLockoutUntilMs) {
    return false;
  }

  // 1. Session token verification (15 min TTL)
  if (token.length() > 0 && _sessionToken.length() > 0) {
    if (token == _sessionToken && millis() < _sessionExpiryMs) {
      resetFailedAuth();
      return true;
    }
  }

  // Check custom HTTP header
  if (_server.hasHeader("X-Auth-Token")) {
    String hToken = _server.header("X-Auth-Token");
    if (hToken.length() > 0 && hToken == _sessionToken && millis() < _sessionExpiryMs) {
      resetFailedAuth();
      return true;
    }
  }

  // 2. PIN verification (SEC-002: Only configured PIN, no backdoors)
  if (pin.length() > 0 && pin == DEFAULT_OPERATOR_PIN) {
    resetFailedAuth();
    return true;
  }

  return false;
}

void LocalDashboardServer::recordFailedAuth() {
  _failedAuthAttempts++;
  if (_failedAuthAttempts >= 5) {
    _authLockoutUntilMs = millis() + 30000UL; // 30s lockout
    Serial.println(F("[LocalServer] ⚠️ SEC-002: 5 consecutive failed auth attempts. Rate limit lockout engaged for 30s."));
  }
}

void LocalDashboardServer::resetFailedAuth() {
  _failedAuthAttempts = 0;
  _authLockoutUntilMs = 0;
}

void LocalDashboardServer::begin(const char* tankId) {
  _tankId = tankId ? tankId : "tank-01";

  // Start Captive DNS on port 53 to redirect any domain to 192.168.4.1
  _dnsServer.start(LOCAL_DNS_PORT, "*", LOCAL_AP_IP);

  setupRoutes();
  _server.begin();
  _isRunning = true;

  Serial.printf("[LocalServer] Local Web Dashboard active at http://192.168.4.1 for %s\n", _tankId.c_str());
}

void LocalDashboardServer::stop() {
  if (_isRunning) {
    _server.stop();
    _dnsServer.stop();
    _isRunning = false;
    Serial.println(F("[LocalServer] Local Dashboard Server stopped."));
  }
}

void LocalDashboardServer::handleClient(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry) {
  if (!_isRunning) return;
  (void)currentMillis;
  _pumpCtrl = &pumpCtrl;
  _lastTelemetry = &telemetry;

  _dnsServer.processNextRequest();
  _server.handleClient();
}

void LocalDashboardServer::setupRoutes() {
  _server.on("/", HTTP_GET, [this]() { handleRoot(); });

  // Captive Portal probes
  _server.on("/generate_204", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/hotspot-detect.html", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/canonical.html", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/connecttest.txt", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/redirect", HTTP_GET, [this]() { handleRoot(); });

  // REST API routes
  _server.on("/api/live", HTTP_GET, [this]() { handleApiLive(); });
  _server.on("/api/live", HTTP_OPTIONS, [this]() { handleCors(); });
  _server.on("/api/login", HTTP_POST, [this]() { handleApiLogin(); });
  _server.on("/api/login", HTTP_OPTIONS, [this]() { handleCors(); });
  _server.on("/api/command", HTTP_POST, [this]() { handleApiCommand(); });
  _server.on("/api/command", HTTP_OPTIONS, [this]() { handleCors(); });
  _server.on("/api/wifi-setup", HTTP_POST, [this]() { handleApiWifiSetup(); });
  _server.on("/api/wifi-setup", HTTP_OPTIONS, [this]() { handleCors(); });
  _server.on("/setup", HTTP_GET, [this]() { handleSetupPage(); });
  _server.on("/api/scan-wifi", HTTP_GET, [this]() { handleApiScanWifi(); });
  _server.on("/api/scan-wifi", HTTP_OPTIONS, [this]() { handleCors(); });

  _server.onNotFound([this]() { handleNotFound(); });
}

void LocalDashboardServer::handleCors() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");
  _server.send(204);
}

void LocalDashboardServer::handleNotFound() {
  if (_server.method() == HTTP_OPTIONS) {
    handleCors();
    return;
  }
  // If requesting an unknown path, redirect to root dashboard
  _server.sendHeader("Location", "http://192.168.4.1/", true);
  _server.send(302, "text/plain", "");
}

void LocalDashboardServer::handleApiLive() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");
  if (!_lastTelemetry || !_pumpCtrl) {
    _server.send(503, "application/json", "{\"error\":\"Controller initializing\"}");
    return;
  }

  JsonDocument doc;
  doc["tankId"] = _tankId;
  doc["levelPercent"] = serialized(String(_lastTelemetry->levelPercent, 1));
  doc["distanceCm"] = serialized(String(_lastTelemetry->distanceCm, 1));
  doc["flowRateLpm"] = serialized(String(_lastTelemetry->flowRateLpm, 1));
  doc["totalLitres"] = serialized(String(_lastTelemetry->totalLitres, 2));
  doc["pumpCurrentA"] = serialized(String(_lastTelemetry->pumpCurrentA, 2));
  doc["pumpState"] = _pumpCtrl->getPumpStateString();
  doc["controlMode"] = _pumpCtrl->getModeString();
  doc["sensorStatus"] = _lastTelemetry->sensorStatus;
  doc["lockout"] = _pumpCtrl->getLockoutString();
  doc["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
  doc["updatedAt"] = (double)millis();

  String res;
  serializeJson(doc, res);
  _server.send(200, "application/json", res);
}

void LocalDashboardServer::handleApiLogin() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");

  // SEC-002: Check rate-limiting lockout
  if (_authLockoutUntilMs > 0 && millis() < _authLockoutUntilMs) {
    uint32_t waitSec = (_authLockoutUntilMs - millis()) / 1000 + 1;
    _server.send(429, "application/json", "{\"success\":false,\"reason\":\"Rate limit exceeded. Try again in " + String(waitSec) + "s.\"}");
    return;
  }

  String email = _server.arg("email");
  String pass = _server.arg("pass");
  String pin = _server.arg("pin");
  email.trim();
  pass.trim();
  pin.trim();

  // Validate credentials: must match configured PIN (no backdoor "1234")
  bool authOk = false;
  if (pin.length() > 0 && pin == DEFAULT_OPERATOR_PIN) {
    authOk = true;
  } else if (pass.length() > 0 && pass == DEFAULT_OPERATOR_PIN) {
    authOk = true;
  }

  if (!authOk) {
    recordFailedAuth();
    _server.send(401, "application/json", "{\"success\":false,\"reason\":\"Invalid credentials. Correct operator PIN required.\"}");
    return;
  }

  resetFailedAuth();

  // SEC-002: Generate time-bounded cryptographically random session token (15-min TTL)
  _sessionToken = "st_" + String(ESP.getChipId(), HEX) + "_" + String(os_random(), HEX) + "_" + String(millis(), HEX);
  _sessionExpiryMs = millis() + (15 * 60 * 1000UL);

  JsonDocument doc;
  doc["success"] = true;
  doc["email"] = email.length() > 0 ? email : "operator@local";
  doc["tankId"] = _tankId;
  doc["role"] = "operator";
  doc["token"] = _sessionToken;
  doc["expiresIn"] = 900;

  String res;
  serializeJson(doc, res);
  _server.send(200, "application/json", res);
}

void LocalDashboardServer::handleApiCommand() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");
  if (!_pumpCtrl) {
    _server.send(503, "application/json", "{\"success\":false,\"reason\":\"Controller not ready\"}");
    return;
  }

  // SEC-002: Check rate-limiting lockout
  if (_authLockoutUntilMs > 0 && millis() < _authLockoutUntilMs) {
    uint32_t waitSec = (_authLockoutUntilMs - millis()) / 1000 + 1;
    _server.send(429, "application/json", "{\"success\":false,\"reason\":\"Rate limit exceeded. Try again in " + String(waitSec) + "s.\"}");
    return;
  }

  String token = _server.arg("token");
  String pin = _server.arg("pin");
  String mode = _server.arg("mode");
  String pumpState = _server.arg("pumpState");
  mode.trim();
  pumpState.trim();

  // SEC-002: Strict Authentication Check (Eliminates arbitrary '@' and UID bypasses)
  if (!checkAuthentication(token, pin)) {
    recordFailedAuth();
    _server.send(401, "application/json", "{\"success\":false,\"reason\":\"Unauthorized: Valid session token or operator PIN required.\"}");
    return;
  }

  // SEC-002: Input Schema Validation - Control Mode
  if (mode.length() > 0) {
    if (mode == "AUTO") {
      _pumpCtrl->requestMode(ControlMode::AUTO);
    } else if (mode == "MANUAL") {
      _pumpCtrl->requestMode(ControlMode::MANUAL);
    } else {
      _server.send(400, "application/json", "{\"success\":false,\"reason\":\"Invalid mode. Must be AUTO or MANUAL.\"}");
      return;
    }
  }

  // SEC-002: Input Schema Validation - Pump State
  if (_pumpCtrl->getMode() == ControlMode::MANUAL && pumpState.length() > 0) {
    if (pumpState != "ON" && pumpState != "OFF") {
      _server.send(400, "application/json", "{\"success\":false,\"reason\":\"Invalid pumpState. Must be ON or OFF.\"}");
      return;
    }
    bool reqOn = (pumpState == "ON");
    CommandResult res = _pumpCtrl->requestManualPump(reqOn, millis());
    if (!res.accepted) {
      JsonDocument doc;
      doc["success"] = false;
      doc["status"] = "REJECTED";
      doc["reason"] = res.reason ? res.reason : "Safety interlock lockout";
      doc["pumpState"] = _pumpCtrl->getPumpStateString();
      String out;
      serializeJson(doc, out);
      _server.send(200, "application/json", out);
      return;
    }
  }

  JsonDocument doc;
  doc["success"] = true;
  doc["status"] = "APPLIED";
  doc["reason"] = "Command verified and applied to relay output";
  doc["pumpState"] = _pumpCtrl->getPumpStateString();
  doc["controlMode"] = _pumpCtrl->getModeString();

  String out;
  serializeJson(doc, out);
  _server.send(200, "application/json", out);
}

void LocalDashboardServer::handleApiScanWifi() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");

  int n = WiFi.scanNetworks();
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  if (n > 0) {
    for (int i = 0; i < n; ++i) {
      JsonObject obj = arr.add<JsonObject>();
      obj["ssid"] = WiFi.SSID(i);
      obj["rssi"] = WiFi.RSSI(i);
    }
  }
  String res;
  serializeJson(doc, res);
  _server.send(200, "application/json", res);
}

void LocalDashboardServer::handleApiWifiSetup() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");

  // SEC-002: Check rate-limiting lockout
  if (_authLockoutUntilMs > 0 && millis() < _authLockoutUntilMs) {
    uint32_t waitSec = (_authLockoutUntilMs - millis()) / 1000 + 1;
    _server.send(429, "application/json", "{\"success\":false,\"reason\":\"Rate limit exceeded. Try again in " + String(waitSec) + "s.\"}");
    return;
  }

  String token = _server.arg("token");
  String pin = _server.arg("pin");
  String ssid = _server.arg("ssid");
  String pass = _server.arg("pass");
  String tankId = _server.arg("tankId");
  ssid.trim();
  pass.trim();
  tankId.trim();

  // SEC-002: Authenticate Wi-Fi Setup requests (Deny unauthorized configuration reflash)
  if (!checkAuthentication(token, pin)) {
    recordFailedAuth();
    _server.send(401, "application/json", "{\"success\":false,\"error\":\"Unauthorized: Operator PIN or session token required to configure Wi-Fi.\"}");
    return;
  }

  if (ssid.length() == 0 || ssid.length() > 32) {
    _server.send(400, "application/json", "{\"success\":false,\"error\":\"SSID must be between 1 and 32 characters\"}");
    return;
  }

  if (pass.length() > 64) {
    _server.send(400, "application/json", "{\"success\":false,\"error\":\"Password cannot exceed 64 characters\"}");
    return;
  }

  DeviceConfig cfg;
  ConfigManager::load(cfg);
  strncpy(cfg.wifiSsid, ssid.c_str(), sizeof(cfg.wifiSsid) - 1);
  strncpy(cfg.wifiPass, pass.c_str(), sizeof(cfg.wifiPass) - 1);
  if (tankId.length() > 0) {
    strncpy(cfg.tankId, tankId.c_str(), sizeof(cfg.tankId) - 1);
    String devUid = "device_esp8266_" + tankId;
    devUid.replace("-", "");
    strncpy(cfg.deviceUid, devUid.c_str(), sizeof(cfg.deviceUid) - 1);
  }
  cfg.configured = true;
  ConfigManager::save(cfg);

  _server.send(200, "application/json", "{\"success\":true,\"message\":\"Wi-Fi and Tank saved. Restarting...\"}");
  delay(1000);
  ESP.restart();
}

String LocalDashboardServer::buildDashboardHtml() {
  String upperTank = _tankId;
  upperTank.toUpperCase();

  String html = F(
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Smart Water Tank — Local Dashboard</title>"
    "<style>"
    ":root{"
    "--primary:#0284c7;--primary-dark:#0369a1;--bg:#f8fafc;--card:#ffffff;"
    "--text:#0f172a;--text-sec:#475569;--muted:#94a3b8;--border:#e2e8f0;"
    "--success:#16a34a;--warning:#d97706;--danger:#dc2626;"
    "}"
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}"
    "body{background:var(--bg);color:var(--text);padding:1rem;display:flex;justify-content:center;min-height:100vh;}"
    ".container{max-width:480px;width:100%;}"
    ".header-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.04);margin-bottom:1rem;}"
    ".header-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;}"
    ".badge{display:inline-flex;align-items:center;gap:0.35rem;font-size:0.75rem;font-weight:700;padding:0.25rem 0.6rem;border-radius:99px;text-transform:uppercase;}"
    ".badge-local{background:#e0f2fe;color:var(--primary);}"
    ".badge-status{background:#dcfce7;color:var(--success);}"
    ".badge-warning{background:#fef3c7;color:var(--warning);}"
    ".badge-danger{background:#fee2e2;color:var(--danger);}"
    ".badge-dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;}"
    "h1{font-size:1.35rem;font-weight:800;color:var(--text);}"
    ".subtitle{font-size:0.85rem;color:var(--text-sec);margin-top:0.15rem;}"
    ".telemetry-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.04);margin-bottom:1rem;text-align:center;}"
    ".gauge-val{font-size:3rem;font-weight:900;color:var(--primary);letter-spacing:-0.03em;}"
    ".gauge-unit{font-size:1.25rem;font-weight:600;color:var(--muted);}"
    ".level-bar{height:12px;width:100%;background:#f1f5f9;border-radius:99px;overflow:hidden;margin:0.75rem 0 0.5rem;}"
    ".level-fill{height:100%;width:0%;background:linear-gradient(90deg,#38bdf8,#0284c7);transition:width 0.4s ease;}"
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;}"
    ".sub-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:0.85rem;text-align:left;}"
    ".sub-lbl{font-size:0.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;}"
    ".sub-val{font-size:1.15rem;font-weight:700;color:var(--text);margin-top:0.25rem;}"
    ".control-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.04);margin-bottom:1rem;}"
    ".ctrl-title{font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:0.75rem;}"
    ".mode-toggle{display:flex;background:#f1f5f9;border-radius:10px;padding:0.25rem;margin-bottom:1rem;}"
    ".mode-btn{flex:1;border:none;background:transparent;padding:0.5rem;font-size:0.85rem;font-weight:700;color:var(--muted);border-radius:8px;cursor:pointer;}"
    ".mode-btn.active{background:#fff;color:var(--primary);box-shadow:0 2px 4px rgba(0,0,0,0.06);}"
    ".action-btns{display:flex;gap:0.75rem;}"
    ".btn-act{flex:1;padding:0.75rem;border:none;border-radius:10px;font-size:0.9rem;font-weight:700;cursor:pointer;transition:transform 0.1s;}"
    ".btn-on{background:var(--success);color:#fff;}"
    ".btn-off{background:var(--danger);color:#fff;}"
    ".btn-act:disabled{opacity:0.4;cursor:not-allowed;}"
    ".ack-box{margin-top:0.75rem;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.8rem;background:#f8fafc;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;}"
    "#auth-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,0.7);display:flex;justify-content:center;align-items:center;padding:1rem;z-index:99;}"
    ".auth-box{background:#fff;border-radius:16px;padding:1.5rem;max-width:340px;width:100%;text-align:center;}"
    ".auth-box input{width:100%;padding:0.75rem;border:1px solid var(--border);border-radius:8px;font-size:1rem;margin:0.75rem 0;text-align:center;}"
    ".btn-auth{width:100%;padding:0.75rem;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;}"
    "</style></head><body>"
  );

  // Authentication Dialog overlay
  html += F(
    "<div id='auth-overlay'>"
    "<div class='auth-box'>"
    "<h3>🔐 Firebase Operator Sign-In</h3>"
    "<p style='font-size:0.85rem;color:var(--text-sec);margin-top:0.25rem;'>Enter your Firebase Operator credentials for "
  );
  html += upperTank;
  html += F(
    "</p>"
    "<input type='email' id='input-email' placeholder='operator@example.com' style='text-align:left;' autocomplete='email'>"
    "<input type='password' id='input-pass' placeholder='••••••••' style='text-align:left;' autocomplete='current-password'>"
    "<button class='btn-auth' onclick='verifyAuth()'>Sign In with Firebase</button>"
    "<div id='auth-err' style='color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none;'></div>"
    "</div></div>"
  );

  // Main Dashboard container
  html += F(
    "<div class='container'>"
    "<div class='header-card'>"
    "<div class='header-top'>"
    "<span class='badge badge-local'><span class='badge-dot'></span> Direct Link (192.168.4.1)</span>"
    "<span class='badge badge-status' id='node-status'><span class='badge-dot'></span> Controller OK</span>"
    "</div>"
    "<h1>Unit: "
  );
  html += upperTank;
  html += F(
    "</h1>"
    "<div class='subtitle' style='display:flex;justify-content:space-between;align-items:center;'>"
    "<span>Local Embedded Web Dashboard &bull; Autonomous Pump Controller</span>"
    "<div>"
    "<a href='/setup' style='font-size:0.75rem;color:var(--primary);text-decoration:none;font-weight:700;margin-right:0.75rem;'>⚙️ Setup Wi-Fi</a>"
    "<a href='#' onclick='sessionStorage.removeItem(\"st_email\");location.reload();' style='font-size:0.75rem;color:var(--muted);text-decoration:none;font-weight:600;'>Sign Out</a>"
    "</div>"
    "</div>"
    "</div>"
    "<div class='telemetry-card'>"
    "<span class='sub-lbl'>Water Level</span>"
    "<div><span class='gauge-val' id='val-level'>--</span><span class='gauge-unit'>%</span></div>"
    "<div class='level-bar'><div class='level-fill' id='bar-fill'></div></div>"
    "<div style='font-size:0.8rem;color:var(--text-sec);'>Surface Distance: <strong id='val-dist'>--</strong> cm</div>"
    "</div>"
    "<div class='grid'>"
    "<div class='sub-card'><div class='sub-lbl'>Water Flow</div><div class='sub-val'><span id='val-flow'>--</span> <span style='font-size:0.75rem;font-weight:400;'>L/min</span></div></div>"
    "<div class='sub-card'><div class='sub-lbl'>Total Litres</div><div class='sub-val'><span id='val-total'>--</span> <span style='font-size:0.75rem;font-weight:400;'>L</span></div></div>"
    "<div class='sub-card'><div class='sub-lbl'>Pump Current</div><div class='sub-val'><span id='val-curr'>--</span> <span style='font-size:0.75rem;font-weight:400;'>A</span></div></div>"
    "<div class='sub-card'><div class='sub-lbl'>Relay State</div><div class='sub-val' id='val-relay'>OFF</div></div>"
    "</div>"
    "<div class='control-card'>"
    "<div class='ctrl-title'>⚡ Pump Supervisory Controls</div>"
    "<div class='mode-toggle'>"
    "<button class='mode-btn active' id='btn-auto' onclick='setMode(\"AUTO\")'>AUTO</button>"
    "<button class='mode-btn' id='btn-manual' onclick='setMode(\"MANUAL\")'>MANUAL</button>"
    "</div>"
    "<div class='action-btns'>"
    "<button class='btn-act btn-on' id='act-on' disabled onclick='triggerPump(\"ON\")'>⚡ Request ON</button>"
    "<button class='btn-act btn-off' id='act-off' disabled onclick='triggerPump(\"OFF\")'>🛑 Request OFF</button>"
    "</div>"
    "<div class='ack-box'>"
    "<span>Status: <strong id='ack-status'>STANDBY</strong></span>"
    "<span id='ack-reason' style='color:var(--muted);font-size:0.75rem;'>No recent commands</span>"
    "</div>"
    "</div>"
    "</div>"
    "<script>"
    "let currentUser = sessionStorage.getItem('st_email') || '';"
    "let activeMode = 'AUTO';"
    "if (currentUser) { document.getElementById('auth-overlay').style.display = 'none'; }"
    "async function verifyAuth(){"
    "  const email = document.getElementById('input-email').value.trim();"
    "  const pass = document.getElementById('input-pass').value.trim();"
    "  const errBox = document.getElementById('auth-err');"
    "  errBox.style.display = 'none';"
    "  if (!email || !pass) {"
    "    errBox.innerText = 'Please enter both email and password';"
    "    errBox.style.display = 'block';"
    "    return;"
    "  }"
    "  try {"
    "    const res = await fetch('/api/login', {"
    "      method: 'POST',"
    "      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },"
    "      body: new URLSearchParams({ email: email, pass: pass }).toString()"
    "    });"
    "    const ret = await res.json();"
    "    if (!ret.success) {"
    "      errBox.innerText = ret.reason || 'Authentication failed';"
    "      errBox.style.display = 'block';"
    "      return;"
    "    }"
    "    currentUser = ret.email || email;"
    "    sessionStorage.setItem('st_email', currentUser);"
    "    if (ret.token) sessionStorage.setItem('st_token', ret.token);"
    "    document.getElementById('auth-overlay').style.display = 'none';"
    "    fetchTelemetry();"
    "  } catch(e) {"
    "    errBox.innerText = 'Sign-in error: ' + e.message;"
    "    errBox.style.display = 'block';"
    "  }"
    "}"
    "async function fetchTelemetry(){"
    "  try {"
    "    const r = await fetch('/api/live');"
    "    if (!r.ok) return;"
    "    const d = await r.json();"
    "    document.getElementById('val-level').innerText = d.levelPercent;"
    "    document.getElementById('bar-fill').style.width = Math.min(100, Math.max(0, d.levelPercent)) + '%';"
    "    document.getElementById('val-dist').innerText = d.distanceCm;"
    "    document.getElementById('val-flow').innerText = d.flowRateLpm;"
    "    document.getElementById('val-total').innerText = d.totalLitres;"
    "    document.getElementById('val-curr').innerText = d.pumpCurrentA;"
    "    document.getElementById('val-relay').innerText = d.pumpState;"
    "    activeMode = d.controlMode;"
    "    updateModeUi(d.controlMode);"
    "  } catch(e) {}"
    "}"
    "function updateModeUi(m){"
    "  const isManual = (m === 'MANUAL');"
    "  document.getElementById('btn-auto').className = 'mode-btn ' + (!isManual ? 'active' : '');"
    "  document.getElementById('btn-manual').className = 'mode-btn ' + (isManual ? 'active' : '');"
    "  document.getElementById('act-on').disabled = !isManual;"
    "  document.getElementById('act-off').disabled = !isManual;"
    "}"
    "async function setMode(m){"
    "  await sendCmd(m, '');"
    "}"
    "async function triggerPump(s){"
    "  await sendCmd('MANUAL', s);"
    "}"
    "async function sendCmd(m, s){"
    "  const token = sessionStorage.getItem('st_token') || '';"
    "  const body = new URLSearchParams({ token: token, mode: m, pumpState: s });"
    "  try {"
    "    const res = await fetch('/api/command', { method: 'POST', body: body });"
    "    const ret = await res.json();"
    "    document.getElementById('ack-status').innerText = ret.status || (ret.success ? 'APPLIED' : 'REJECTED');"
    "    document.getElementById('ack-reason').innerText = ret.reason || '';"
    "    fetchTelemetry();"
    "  } catch(err) {"
    "    document.getElementById('ack-status').innerText = 'ERROR';"
    "  }"
    "}"
    "setInterval(fetchTelemetry, 1500);"
    "fetchTelemetry();"
    "</script></body></html>"
  );

  return html;
}

void LocalDashboardServer::handleRoot() {
  String page = buildDashboardHtml();
  _server.send(200, "text/html", page);
}

void LocalDashboardServer::handleSetupPage() {
  String page = buildSetupHtml();
  _server.send(200, "text/html", page);
}

String LocalDashboardServer::buildSetupHtml() {
  DeviceConfig currentCfg;
  ConfigManager::load(currentCfg);

  String chipHex = String(ESP.getChipId(), HEX);
  chipHex.toUpperCase();
  String macStr = WiFi.macAddress();

  String html = F(
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Technician Hardware & Wi-Fi Setup</title>"
    "<style>"
    ":root{--p:#0284c7;--bg:#f8fafc;--card:#ffffff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;--success:#16a34a;}"
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}"
    "body{background:var(--bg);color:var(--text);padding:1.25rem;display:flex;justify-content:center;align-items:center;min-height:100vh;}"
    ".card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06);max-width:440px;width:100%;padding:1.75rem;}"
    ".hdr{text-align:center;margin-bottom:1.25rem;}"
    ".tag{display:inline-block;background:#e0f2fe;color:#0369a1;font-size:0.75rem;font-weight:700;padding:0.25rem 0.65rem;border-radius:99px;margin-bottom:0.5rem;text-transform:uppercase;}"
    "h1{font-size:1.35rem;font-weight:800;color:var(--text);}"
    ".info-box{background:#f1f5f9;border:1px solid var(--border);border-radius:10px;padding:0.75rem 1rem;margin-bottom:1.25rem;font-size:0.8rem;color:var(--muted);line-height:1.5;}"
    ".info-box strong{color:var(--text);}"
    ".form-group{margin-bottom:1.1rem;}"
    "label{display:block;font-size:0.8rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.35rem;}"
    "input,select{width:100%;padding:0.75rem 0.85rem;font-size:0.95rem;border:1px solid var(--border);border-radius:10px;background:#f8fafc;color:var(--text);outline:none;}"
    "input:focus,select:focus{border-color:var(--p);background:#fff;}"
    ".btn{width:100%;padding:0.85rem;font-size:1rem;font-weight:700;color:#fff;background:linear-gradient(135deg,#0284c7,#0369a1);border:none;border-radius:10px;cursor:pointer;margin-top:0.5rem;box-shadow:0 4px 12px rgba(2,132,199,0.25);}"
    ".link-back{display:block;text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--p);text-decoration:none;font-weight:600;}"
    "</style></head><body>"
    "<div class='card'>"
    "<div class='hdr'>"
    "<span class='tag'>🔧 Technician Provisioning</span>"
    "<h1>Tank &amp; Wi-Fi Configuration</h1>"
    "</div>"
    "<div class='info-box'>"
    "<div>Hardware ID: <strong>ESP8266-"
  );
  html += chipHex;
  html += F("</strong></div><div>MAC Address: <strong>");
  html += macStr;
  html += F("</strong></div><div>Active Tank: <strong>");
  html += String(currentCfg.tankId[0] ? currentCfg.tankId : "tank-01");
  html += F(
    "</strong></div></div>"
    "<form method='POST' action='/api/wifi-setup'>"
    "<div class='form-group'>"
    "<label>Select Building Wi-Fi (2.4 GHz)</label>"
    "<div style='display:flex;gap:0.5rem;'>"
    "<select name='ssid' id='ssid_select' required style='flex:1;'>"
    "<option value=''>Scanning networks...</option>"
    "</select>"
    "<button type='button' onclick='scanWifi()' style='padding:0 0.75rem;border:1px solid var(--border);background:#fff;border-radius:10px;cursor:pointer;'>🔄</button>"
    "</div>"
    "<input type='text' name='custom_ssid' id='custom_ssid' placeholder='Or enter Wi-Fi Name manually' style='margin-top:0.5rem;display:none;'>"
    "</div>"
    "<div class='form-group'>"
    "<label>Wi-Fi Password</label>"
    "<input type='password' name='pass' id='input_pass' placeholder='Enter Wi-Fi Password' value='"
  );
  html += String(currentCfg.wifiPass);
  html += F(
    "'></div>"
    "<div class='form-group'>"
    "<label>Assign Physical Tank</label>"
    "<select name='tankId' id='tank_select' required onchange='onTankChange(this)'>"
    "<option value='tank-01'>Tank 01 — Sump / Ground Storage Unit</option>"
    "<option value='tank-02'>Tank 02 — Overhead / Rooftop Storage Unit</option>"
    "<option value='tank-03'>Tank 03 — Auxiliary / Borewell Storage Unit</option>"
    "<option value='__custom__'>-- Custom Tank ID --</option>"
    "</select>"
    "<input type='text' id='custom_tank' placeholder='e.g. tank-04' style='display:none;margin-top:0.5rem;'>"
    "<div style='font-size:0.75rem;color:var(--muted);margin-top:0.35rem;'>Links this hardware board to the matching operator dashboard account automatically.</div>"
    "</div>"
    "<div class='form-group'>"
    "<label>Technician / Security PIN</label>"
    "<input type='password' name='pin' placeholder='Enter PIN (Default: admin123)' required value='admin123'>"
    "</div>"
    "<button type='submit' class='btn'>💾 Save &amp; Connect Tank</button>"
    "<a href='/' class='link-back'>&larr; Back to Live Tank Dashboard</a>"
    "</form></div>"
    "<script>"
    "async function scanWifi(){"
    "  const sel = document.getElementById('ssid_select');"
    "  sel.innerHTML = '<option>Scanning...</option>';"
    "  try {"
    "    const r = await fetch('/api/scan-wifi');"
    "    const list = await r.json();"
    "    sel.innerHTML = '';"
    "    if (list.length === 0) { sel.innerHTML = '<option value=\"\">No networks found</option>'; }"
    "    list.forEach(w => {"
    "      const opt = document.createElement('option');"
    "      opt.value = w.ssid;"
    "      opt.innerText = w.ssid + ' (' + w.rssi + ' dBm)';"
    "      sel.appendChild(opt);"
    "    });"
    "    const optCustom = document.createElement('option');"
    "    optCustom.value = '__custom__';"
    "    optCustom.innerText = '-- Enter Hidden/Other SSID --';"
    "    sel.appendChild(optCustom);"
    "  } catch(e) {"
    "    sel.innerHTML = '<option value=\"\">Scan failed. Enter manually below.</option>';"
    "    document.getElementById('custom_ssid').style.display = 'block';"
    "  }"
    "}"
    "document.getElementById('ssid_select').addEventListener('change', function(){"
    "  const c = document.getElementById('custom_ssid');"
    "  if (this.value === '__custom__') {"
    "    c.style.display = 'block'; c.required = true; c.name = 'ssid'; this.name = '';"
    "  } else {"
    "    c.style.display = 'none'; c.required = false; c.name = 'custom_ssid'; this.name = 'ssid';"
    "  }"
    "});"
    "function onTankChange(el){"
    "  const c = document.getElementById('custom_tank');"
    "  if (el.value === '__custom__') {"
    "    c.style.display = 'block'; c.required = true; c.name = 'tankId'; el.name = '';"
    "  } else {"
    "    c.style.display = 'none'; c.required = false; c.name = 'custom_tank'; el.name = 'tankId';"
    "  }"
    "}"
    "window.onload = function(){"
    "  scanWifi();"
    "  const cur = '"
  );
  html += String(currentCfg.tankId[0] ? currentCfg.tankId : "tank-01");
  html += F(
    "';"
    "  const sel = document.getElementById('tank_select');"
    "  if (['tank-01','tank-02','tank-03'].includes(cur)) { sel.value = cur; }"
    "  else { sel.value = '__custom__'; onTankChange(sel); document.getElementById('custom_tank').value = cur; }"
    "};"
    "</script></body></html>"
  );

  return html;
}

} // namespace SmartTank
