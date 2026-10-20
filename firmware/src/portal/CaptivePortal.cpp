#include "CaptivePortal.h"

namespace SmartTank {

static const IPAddress AP_IP(192, 168, 4, 1);
static const uint16_t DNS_PORT = 53;

CaptivePortal::CaptivePortal()
  : _server(80),
    _isComplete(false),
    _isRunning(false) {}

CaptivePortal::~CaptivePortal() {
  stop();
}

void CaptivePortal::start(const char* apName) {
  if (apName != nullptr && strlen(apName) > 0) {
    _apName = apName;
  } else {
    _apName = "SmartTank-Setup-" + String(ESP.getChipId() & 0xFFFF, HEX);
    _apName.toUpperCase();
  }

  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(_apName.c_str());

  _dnsServer.start(DNS_PORT, "*", AP_IP);
  setupRoutes();
  _server.begin();

  _isRunning = true;
  _isComplete = false;

  Serial.println(F("========================================================="));
  Serial.printf("[Portal] SoftAP Created: %s\n", _apName.c_str());
  Serial.println(F("[Portal] Captive Portal active at: http://192.168.4.1"));
  Serial.println(F("[Portal] Connect your phone to configure Wi-Fi and Tank ID."));
  Serial.println(F("========================================================="));
}

void CaptivePortal::stop() {
  if (_isRunning) {
    _server.stop();
    _dnsServer.stop();
    WiFi.softAPdisconnect(true);
    _isRunning = false;
    Serial.println(F("[Portal] Captive portal stopped. Heap memory reclaimed."));
  }
}

void CaptivePortal::handleClient() {
  if (!_isRunning) return;
  _dnsServer.processNextRequest();
  _server.handleClient();
}

void CaptivePortal::setupRoutes() {
  _server.on("/", HTTP_GET, [this]() { handleRoot(); });

  // Android / Apple / Windows captive detection hooks
  _server.on("/generate_204", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/hotspot-detect.html", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/canonical.html", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/connecttest.txt", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/redirect", HTTP_GET, [this]() { handleRoot(); });

  // Form submission
  _server.on("/save", HTTP_POST, [this]() { handleSave(); });

  _server.onNotFound([this]() { handleNotFound(); });
}

void CaptivePortal::handleNotFound() {
  _server.sendHeader("Location", "http://192.168.4.1/", true);
  _server.send(302, "text/plain", "");
}

String CaptivePortal::buildHtml(const String& scannedOptions) {
  DeviceConfig currentCfg;
  ConfigManager::load(currentCfg);

  String html = F(
    "<!DOCTYPE html><html><head><meta charset='UTF-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Smart Water Tank Setup</title>"
    "<style>"
    ":root{--p:#2563eb;--bg:#f8fafc;--card:#ffffff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;}"
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}"
    "body{background:var(--bg);color:var(--text);padding:1.25rem;display:flex;justify-content:center;align-items:center;min-height:100vh;}"
    ".card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.06);max-width:420px;width:100%;padding:1.75rem;}"
    ".hdr{text-align:center;margin-bottom:1.5rem;}"
    ".hdr .icon{font-size:2.5rem;margin-bottom:0.35rem;}"
    ".hdr h1{font-size:1.35rem;color:#0f172a;font-weight:700;}"
    ".hdr p{font-size:0.85rem;color:var(--muted);margin-top:0.25rem;}"
    ".form-group{margin-bottom:1.1rem;}"
    "label{display:block;font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.35rem;}"
    "input,select{width:100%;padding:0.75rem 0.85rem;font-size:0.95rem;border:1px solid var(--border);border-radius:10px;background:#f8fafc;color:var(--text);outline:none;transition:border-color 0.15s;}"
    "input:focus,select:focus{border-color:var(--p);background:#fff;}"
    ".btn{width:100%;padding:0.85rem;font-size:1rem;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#1d4ed8);border:none;border-radius:10px;cursor:pointer;margin-top:0.5rem;box-shadow:0 4px 12px rgba(37,99,235,0.25);}"
    ".btn:hover{filter:brightness(1.05);}"
    ".note{font-size:0.75rem;color:var(--muted);text-align:center;margin-top:1.25rem;line-height:1.4;}"
    ".tag{display:inline-block;background:#e0f2fe;color:#0284c7;font-size:0.75rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:99px;margin-bottom:0.75rem;}"
    "</style></head><body>"
    "<div class='card'>"
    "<div class='hdr'>"
    "<div class='icon'>💧</div>"
    "<span class='tag'>Hardware Onboarding</span>"
    "<h1>Smart Water Tank Setup</h1>"
    "<p>Configure local Wi-Fi and assign Tank ID</p>"
    "</div>"
    "<form method='POST' action='/save'>"
  );

  // Wi-Fi SSID
  html += F("<div class='form-group'><label>Select 2.4 GHz Wi-Fi</label>");
  if (scannedOptions.length() > 0) {
    html += F("<select name='ssid' id='ssid_select' onchange='checkCustomSsid(this)'>");
    html += scannedOptions;
    html += F("<option value='__custom__'>-- Enter Other Wi-Fi SSID --</option></select>");
    html += F("<input type='text' name='custom_ssid' id='custom_ssid' placeholder='Enter Wi-Fi Network Name' style='display:none;margin-top:0.5rem;'>");
  } else {
    html += F("<input type='text' name='ssid' placeholder='e.g. Home_WiFi' required value='");
    html += String(currentCfg.wifiSsid);
    html += F("'>");
  }
  html += F("</div>");

  // Wi-Fi Password
  html += F(
    "<div class='form-group'>"
    "<label>Wi-Fi Password</label>"
    "<input type='password' name='pass' placeholder='Enter Wi-Fi Password'>"
    "</div>"
  );

  // Assigned Tank ID
  html += F(
    "<div class='form-group'>"
    "<label>Assigned Tank ID</label>"
    "<input type='text' name='tankId' required placeholder='e.g. tank-01, tank-02' value='"
  );
  html += String(currentCfg.tankId[0] ? currentCfg.tankId : "tank-01");
  html += F(
    "'>"
    "<div style='font-size:0.75rem;color:var(--muted);margin-top:0.25rem;'>This links this physical board to the operator on the dashboard.</div>"
    "</div>"
  );

  // Firebase Host
  html += F(
    "<div class='form-group'>"
    "<label>Firebase RTDB Host</label>"
    "<input type='text' name='host' value='"
  );
  html += String(currentCfg.firebaseHost[0] ? currentCfg.firebaseHost : "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com");
  html += F(
    "'></div>"
    "<button type='submit' class='btn'>💾 Save &amp; Connect Tank</button>"
    "<div class='note'>Device will save settings to internal flash memory and restart immediately.</div>"
    "</form></div>"
    "<script>"
    "function checkCustomSsid(el){"
    "  var custom = document.getElementById('custom_ssid');"
    "  if (el.value === '__custom__') {"
    "    custom.style.display = 'block'; custom.required = true;"
    "  } else {"
    "    custom.style.display = 'none'; custom.required = false;"
    "  }"
    "}"
    "</script>"
    "</body></html>"
  );

  return html;
}

void CaptivePortal::handleRoot() {
  String scannedOptions = "";
  int n = WiFi.scanNetworks();
  if (n > 0) {
    for (int i = 0; i < n; ++i) {
      String ssid = WiFi.SSID(i);
      int rssi = WiFi.RSSI(i);
      scannedOptions += "<option value='" + ssid + "'>" + ssid + " (" + String(rssi) + " dBm)</option>";
    }
  }

  String page = buildHtml(scannedOptions);
  _server.send(200, "text/html", page);
}

void CaptivePortal::handleSave() {
  String selectedSsid = _server.arg("ssid");
  String customSsid = _server.arg("custom_ssid");
  String pass = _server.arg("pass");
  String tankId = _server.arg("tankId");
  String host = _server.arg("host");

  String finalSsid = (selectedSsid == "__custom__" && customSsid.length() > 0) ? customSsid : selectedSsid;
  finalSsid.trim();
  pass.trim();
  tankId.trim();
  host.trim();

  if (finalSsid.length() == 0 || tankId.length() == 0) {
    _server.send(400, "text/html", "<h3>Error: Wi-Fi SSID and Tank ID are required. <a href='/'>Go Back</a></h3>");
    return;
  }

  DeviceConfig cfg;
  memset(&cfg, 0, sizeof(DeviceConfig));
  strncpy(cfg.wifiSsid, finalSsid.c_str(), sizeof(cfg.wifiSsid) - 1);
  strncpy(cfg.wifiPass, pass.c_str(), sizeof(cfg.wifiPass) - 1);
  strncpy(cfg.tankId, tankId.c_str(), sizeof(cfg.tankId) - 1);
  if (host.length() > 0) {
    strncpy(cfg.firebaseHost, host.c_str(), sizeof(cfg.firebaseHost) - 1);
  } else {
    strncpy(cfg.firebaseHost, "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com", sizeof(cfg.firebaseHost) - 1);
  }
  snprintf(cfg.deviceUid, sizeof(cfg.deviceUid), "device_esp8266_%06X", ESP.getChipId());

  bool saved = ConfigManager::save(cfg);
  (void)saved;

  String upperTankId = tankId;
  upperTankId.toUpperCase();

  String response = F(
    "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Configuration Saved</title>"
    "<style>"
    "body{font-family:sans-serif;background:#f0fdf4;color:#166534;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:1rem;text-align:center;}"
    ".box{background:#fff;padding:2rem;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.08);max-width:380px;width:100%;}"
    "h2{color:#15803d;margin-bottom:0.75rem;}"
    "p{font-size:0.95rem;color:#374151;line-height:1.5;margin-bottom:0.5rem;}"
    ".badge{display:inline-block;background:#dcfce7;color:#15803d;font-weight:700;padding:0.35rem 0.75rem;border-radius:99px;margin:0.5rem 0;}"
    "</style></head><body>"
    "<div class='box'>"
    "<h2>✅ Configuration Saved!</h2>"
    "<p>This hardware unit is now assigned to:</p>"
    "<div class='badge'>"
  );
  response += upperTankId;
  response += F(
    "</div>"
    "<p>Restarting device to connect to <strong>"
  );
  response += finalSsid;
  response += F(
    "</strong>...</p>"
    "<p style='font-size:0.8rem;color:#6b7280;margin-top:1rem;'>You may close this window and open your Web Dashboard.</p>"
    "</div></body></html>"
  );

  _server.send(200, "text/html", response);

  Serial.println(F("[Portal] Configuration successfully committed to EEPROM. Restarting..."));
  _isComplete = true;

  delay(1200);
  ESP.restart();
}

} // namespace SmartTank
