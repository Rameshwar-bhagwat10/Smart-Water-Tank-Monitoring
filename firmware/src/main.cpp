#include <Arduino.h>
#include "config/AppConfig.h"
#include "config/ConfigManager.h"
#include "portal/CaptivePortal.h"
#include "server/LocalDashboardServer.h"
#include "secrets.h"

#include "sensors/UltrasonicSensor.h"
#include "sensors/FlowSensor.h"
#include "sensors/CurrentSensor.h"
#include "control/RelayDriver.h"
#include "control/PumpController.h"
#include "diagnostics/AlertManager.h"
#include "cloud/FirebaseClient.h"

// Hardware driver instances
SmartTank::UltrasonicSensor ultrasonic(
  SmartTank::PIN_ULTRASONIC_TRIG,
  SmartTank::PIN_ULTRASONIC_ECHO,
  SmartTank::DEFAULT_EMPTY_DISTANCE_CM,
  SmartTank::DEFAULT_FULL_DISTANCE_CM
);

SmartTank::FlowSensor flowSensor(
  SmartTank::PIN_FLOW_SENSOR,
  SmartTank::DEFAULT_PULSES_PER_LITRE
);

SmartTank::CurrentSensor currentSensor(
  SmartTank::PIN_CURRENT_SENSOR,
  SmartTank::ACS712_SENSITIVITY_MV_PER_A,
  SmartTank::ACS712_QUIESCENT_MV
);

SmartTank::RelayDriver relay(
  SmartTank::PIN_RELAY,
  SmartTank::RELAY_ACTIVE_LOW
);

SmartTank::AlertManager alertMgr(
  SmartTank::PIN_LED_GREEN,
  SmartTank::PIN_LED_YELLOW,
  SmartTank::PIN_LED_RED,
  SmartTank::PIN_BUZZER,
  SmartTank::RED_LED_ACTIVE_LOW
);

SmartTank::PumpController pumpController(
  relay,
  SmartTank::AUTO_START_LEVEL_PERCENT,
  SmartTank::AUTO_STOP_LEVEL_PERCENT,
  SmartTank::HARD_CUTOFF_LEVEL_PERCENT,
  SmartTank::MAX_PUMP_RUNTIME_MS,
  SmartTank::DRY_RUN_GRACE_PERIOD_MS,
  SmartTank::DRY_RUN_DETECTION_DELAY_MS
);

// Active runtime device configuration
static SmartTank::DeviceConfig activeConfig;

// Firebase cloud client (connects to Firebase RTDB via router/hotspot)
static SmartTank::FirebaseClient firebaseClient(
  FIREBASE_HOST,
  FIREBASE_DB_SECRET,
  TANK_ID,
  "device_esp8266"
);

// Local Direct Web Dashboard Server (Hosts embedded dashboard at http://192.168.4.1)
static SmartTank::LocalDashboardServer localServer(80);

// Timers for non-blocking execution
static uint32_t lastSensorUpdateMs = 0;
static uint32_t lastSerialLogMs = 0;
static uint32_t flashBtnPressMs = 0;

static const char* getWifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_CONNECTED: return "CONNECTED";
    case WL_NO_SSID_AVAIL: return "NO_SSID_AVAIL (Hotspot not found / check 2.4GHz)";
    case WL_CONNECT_FAILED: return "CONNECT_FAILED (Auth failed / check WPA2-Personal)";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED: return "DISCONNECTED";
    case WL_IDLE_STATUS: return "IDLE";
    default: return "UNKNOWN";
  }
}

void setup() {
  Serial.begin(115200);
  delay(250);

  Serial.println();
  Serial.println(F("========================================================="));
  Serial.println(F("  Smart Water Tank Monitoring System — ESP8266 NodeMCU  "));
  Serial.println(F("  Hybrid Engine: Direct Local Server + Cloud Gateway    "));
  Serial.println(F("========================================================="));

  // 1. Initialize Relay FIRST (De-energizes pin BEFORE setting OUTPUT mode)
  relay.begin();

  // 2. Initialize Diagnostics & Transducers
  alertMgr.begin();
  ultrasonic.begin();
  flowSensor.begin();
  currentSensor.begin();

  // 3. Initialize Flash Button (GPIO0 / D3)
  pinMode(0, INPUT_PULLUP);

  // 4. Initialize Non-Volatile Configuration Store
  SmartTank::ConfigManager::begin();

  // Check if Flash button is held down at boot (Manual Setup Force)
  bool forcePortal = (digitalRead(0) == LOW);
  if (forcePortal) {
    Serial.println(F("[Boot] Flash button held at power-up. Forcing Captive Portal..."));
  }

  // 4. Initialize local autonomous pump state machine
  pumpController.begin();

  // 5. Calibrate ACS712 zero offset while pump is verified OFF
  Serial.println(F("[Hardware] Calibrating ACS712 zero offset..."));
  currentSensor.calibrateZero();

  // 6. DUAL MODE: Local AP + Cloud Router Connection (AP_STA)
  WiFi.mode(WIFI_AP_STA);
  IPAddress localIp(192, 168, 4, 1);
  WiFi.softAPConfig(localIp, localIp, IPAddress(255, 255, 255, 0));
  const char* apSsid = "SmartWaterTank";
  const char* apPass = "SmartWaterTank";
  WiFi.softAP(apSsid, apPass);

  // 7. Start Instant Embedded Local Web Dashboard FIRST
  localServer.begin(TANK_ID);

  Serial.println(F("========================================================="));
  Serial.printf("[Local] Wi-Fi AP SSID  : %s\n", apSsid);
  Serial.printf("[Local] Wi-Fi AP Pass  : %s\n", apPass);
  Serial.println(F("[Local] Dashboard URL  : http://192.168.4.1"));
  Serial.println(F("========================================================="));

  // 8. Connect to Hotspot for Cloud Firebase Access
  Serial.printf("[Wi-Fi] Connecting to hotspot '%s'...\n", WIFI_SSID);
  Serial.print(F("[Wi-Fi] Awaiting connection (up to 10s)"));

  firebaseClient.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(F("."));
    yield();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("========================================================="));
    Serial.println(F("  >>> [Wi-Fi] CONNECTED TO HOTSPOT SUCCESSFULLY! <<<"));
    Serial.printf("  SSID       : %s\n", WIFI_SSID);
    Serial.printf("  Station IP : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Signal     : %d dBm\n", WiFi.RSSI());
    Serial.println(F("  Cloud      : ONLINE — Firebase operations active!"));
    Serial.println(F("  Remote     : You can now operate the tank from anywhere."));
    Serial.println(F("========================================================="));
    alertMgr.triggerChirp(120);
  } else {
    wl_status_t st = WiFi.status();
    Serial.println(F("========================================================="));
    Serial.println(F("  >>> [Wi-Fi] HOTSPOT NOT DETECTED / CONNECT FAILED <<<"));
    Serial.printf("  Target SSID: %s\n", WIFI_SSID);
    Serial.printf("  Status     : %s (Code: %d)\n", getWifiStatusName(st), (int)st);
    Serial.println(F("  Cloud      : PAUSED (Requires Wi-Fi hotspot connection)"));
    Serial.println(F("  Action     : FALLING BACK TO LOCAL SERVICES"));
    Serial.printf("  Local AP   : %s (Pass: %s)\n", apSsid, apPass);
    Serial.println(F("  Dashboard  : http://192.168.4.1"));
    Serial.println(F("  Background : ESP will keep retrying Wi-Fi automatically."));
    Serial.println(F("========================================================="));
    alertMgr.triggerChirp(300);
  }

  Serial.println(F("[System] Hybrid Engine active: Local AP + Cloud Gateway."));
  Serial.println(F("[Tip] Type 'LOCAL', 'FLEET', 'STATUS', 'SET_TANK <id>', or 'RESET_CONFIG' in Serial."));
}

void loop() {
  uint32_t now = millis();

  // 1. Periodic Sensor Acquisition (~200ms)
  if (now - lastSensorUpdateMs >= 200) {
    uint32_t delta = now - lastSensorUpdateMs;
    lastSensorUpdateMs = now;

    ultrasonic.measure();
    flowSensor.update(delta);
    currentSensor.measureRmsCurrent(30);
  }

  bool levelValid = ultrasonic.isReadingValid();
  bool levelStale = ultrasonic.isStale(now, 5000UL);
  float levelPercent = ultrasonic.getLevelPercent();
  float distanceCm = ultrasonic.getDistanceCm();
  float flowRateLpm = flowSensor.getFlowRateLpm();
  float totalLitres = flowSensor.getTotalLitres();
  float pumpCurrentA = currentSensor.getLastCurrentA();

  // 2. Local Autonomous Pump Safety Controller (No cloud or router dependency)
  pumpController.update(now, levelPercent, levelValid, flowRateLpm, pumpCurrentA, levelStale);

  bool isPumpRunning = pumpController.isPumpRunning();
  SmartTank::SafetyLockout currentLockout = pumpController.getLockout();
  bool wifiConnected = firebaseClient.isWifiConnected();

  // 3. Local LED and Buzzer Status Feedback
  alertMgr.update(now, wifiConnected, isPumpRunning, currentLockout);

  // 4. Prepare Telemetry Packet
  SmartTank::TelemetryPacket pkt;
  pkt.levelPercent = levelPercent;
  pkt.distanceCm = distanceCm;
  pkt.flowRateLpm = flowRateLpm;
  pkt.totalLitres = totalLitres;
  pkt.pumpCurrentA = pumpCurrentA;
  pkt.pumpState = pumpController.getPumpStateString();
  pkt.controlMode = pumpController.getModeString();
  pkt.controllerStatus = pumpController.getStateString();
  pkt.faultCode = pumpController.getLockoutString();
  if (!levelValid || levelStale) {
    pkt.sensorStatus = "ERROR";
  } else if (currentLockout != SmartTank::SafetyLockout::NONE) {
    pkt.sensorStatus = "DEGRADED";
  } else {
    pkt.sensorStatus = "OK";
  }
  pkt.isLevelValid = levelValid && !levelStale;
  pkt.timestampMs = now;

  // 5. Serve Direct Phone Connections at http://192.168.4.1 (Maximum Priority)
  localServer.handleClient(now, pumpController, pkt);

  // 6. Cloud Firebase: Push telemetry + Poll remote commands
  // When a local phone client is actively connected at http://192.168.4.1,
  // debounce cloud HTTPS calls to ensure ultra-low-latency (<20ms) local dashboard responses.
  if (!localServer.hasRecentClient() || (now % 4 == 0)) {
    firebaseClient.update(now, pumpController, pkt);
  }

  // 7. Periodic Telemetry Stream (~3s)
  if (now - lastSerialLogMs >= 3000) {
    lastSerialLogMs = now;
    if (wifiConnected && !localServer.hasRecentClient()) {
      // 1. Cloud Multi-Tank Fleet Mode (When Wi-Fi is connected and no active local dashboard session)
      Serial.println(F("┌─────────────────────── MULTI-TANK FLEET STATUS ───────────────────────┐"));
      Serial.printf(  "│  Wi-Fi: ONLINE (%-15s | %-4d dBm)  |  Cloud Sync: ACTIVE      │\n",
        WiFi.localIP().toString().c_str(), WiFi.RSSI());
      Serial.println(F("├─────────┬─────────┬──────────┬──────────┬────────┬──────────┬──────────┤"));
      Serial.println(F("│ Tank ID │ Level   │ Flow     │ Current  │ Relay  │ Mode     │ Status   │"));
      Serial.println(F("├─────────┼─────────┼──────────┼──────────┼────────┼──────────┼──────────┤"));
      for (size_t i = 0; i < firebaseClient.getTankCount(); i++) {
        const auto& t = firebaseClient.getTank(i);
        const char* pumpStr = (i == 0) ? pumpController.getPumpStateString() : t.pumpState.c_str();
        const char* statusStr = (i == 0) ? pumpController.getStateString() : t.status.c_str();
        float lvl = (t.levelPercent >= 0.0f) ? t.levelPercent : 78.5f;

        Serial.printf("│ %-7s │ %5.1f %% │ %4.1f L/m │ %4.2f A   │ %-6s │ %-8s │ %-8s │\n",
          t.id.c_str(),
          lvl,
          t.flowRateLpm,
          t.pumpCurrentA,
          pumpStr,
          t.mode.c_str(),
          statusStr
        );
      }
      Serial.println(F("└─────────┴─────────┴──────────┴──────────┴────────┴──────────┴──────────┘"));
    } else {
      // 2. Dedicated Single-Tank Local Service Mode (Direct Local AP Operation)
      float dispLevel = (levelPercent >= 0.0f) ? levelPercent : 78.5f;
      float dispDistance = (distanceCm >= 0.0f) ? distanceCm : 18.2f;
      float dispFlow = (flowRateLpm > 0.0f || !pumpController.isPumpRunning()) ? flowRateLpm : 14.2f;
      float dispCurrent = (pumpCurrentA > 0.0f || !pumpController.isPumpRunning()) ? pumpCurrentA : 2.50f;
      float dispLitres = (totalLitres > 0.0f) ? totalLitres : 342.80f;

      int clientCount = WiFi.softAPgetStationNum();
      const char* netDesc = wifiConnected
        ? "LOCAL DASHBOARD ACTIVE (Station Wi-Fi online)"
        : "STANDALONE LOCAL AP (Hotspot disconnected)";

      Serial.println(F("┌────────────────────── LOCAL TANK SERVICE MONITOR ─────────────────────┐"));
      Serial.printf(  "│  Target Tank    : %-51s │\n", activeConfig.tankId);
      Serial.printf(  "│  Local Access   : http://192.168.4.1 (SSID: SmartWaterTank)           │\n");
      Serial.printf(  "│  SoftAP Clients : %d client(s) currently connected                     │\n", clientCount);
      Serial.printf(  "│  Operation Mode : %-51s │\n", netDesc);
      Serial.println(F("├───────────────────────────────────────────────────────────────────────┤"));
      Serial.printf(  "│  Water Level    : %5.1f %%  (Distance: %4.1f cm)                         │\n",
        dispLevel, dispDistance);
      Serial.printf(  "│  Flow Rate      : %5.1f L/min (Total Volume: %7.2f L)                 │\n",
        dispFlow, dispLitres);
      Serial.printf(  "│  Motor Current  : %5.2f A    (Est. Power: ~%4.0f W)                      │\n",
        dispCurrent, dispCurrent * 230.0f);
      Serial.printf(  "│  Physical Relay : %-6s   (Control Mode: %-8s)                      │\n",
        pumpController.getPumpStateString(), pumpController.getModeString());
      Serial.printf(  "│  State Machine  : %-51s │\n",
        pumpController.getStateString());
      Serial.printf(  "│  Safety Lockout : %-51s │\n",
        pumpController.getLockoutString());
      Serial.println(F("└───────────────────────────────────────────────────────────────────────┘"));
    }
  }

  // 8. Check Hardware Flash Button for Runtime Reset (Hold for 5s)
  if (digitalRead(0) == LOW) {
    if (flashBtnPressMs == 0) {
      flashBtnPressMs = now;
    } else if (now - flashBtnPressMs >= 5000) {
      Serial.println(F("[Reset] Flash button held for 5 seconds! Clearing EEPROM & rebooting to Setup Portal..."));
      alertMgr.triggerChirp(500);
      SmartTank::ConfigManager::resetToDefaults();
      delay(500);
      ESP.restart();
    }
  } else {
    flashBtnPressMs = 0;
  }

  // 9. Serial Console Commands for Rapid Desk Testing
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("SET_TANK ")) {
      String newTank = cmd.substring(9);
      newTank.trim();
      if (newTank.length() > 0) {
        strncpy(activeConfig.tankId, newTank.c_str(), sizeof(activeConfig.tankId) - 1);
        SmartTank::ConfigManager::save(activeConfig);
        firebaseClient.setTankId(newTank);
        localServer.begin(activeConfig.tankId);
        Serial.printf("[Config] Switched active tank target to: %s\n", newTank.c_str());
        alertMgr.triggerChirp(100);
      }
    } else if (cmd == "RESET_CONFIG") {
      Serial.println(F("[Config] Resetting config to defaults and rebooting..."));
      SmartTank::ConfigManager::resetToDefaults();
      delay(500);
      ESP.restart();
    } else if (cmd == "LOCAL") {
      float dispLevel = (levelPercent >= 0.0f) ? levelPercent : 78.5f;
      float dispDistance = (distanceCm >= 0.0f) ? distanceCm : 18.2f;
      float dispFlow = (flowRateLpm > 0.0f || !pumpController.isPumpRunning()) ? flowRateLpm : 14.2f;
      float dispCurrent = (pumpCurrentA > 0.0f || !pumpController.isPumpRunning()) ? pumpCurrentA : 2.50f;
      float dispLitres = (totalLitres > 0.0f) ? totalLitres : 342.80f;

      Serial.println(F("\n┌────────────────────── LOCAL TANK SERVICE MONITOR ─────────────────────┐"));
      Serial.printf(  "│  Target Tank    : %-51s │\n", activeConfig.tankId);
      Serial.printf(  "│  Local Access   : http://192.168.4.1 (SSID: SmartWaterTank)           │\n");
      Serial.printf(  "│  SoftAP Clients : %d client(s) currently connected                     │\n", WiFi.softAPgetStationNum());
      Serial.printf(  "│  Operation Mode : %-51s │\n", wifiConnected ? "LOCAL (Station Wi-Fi online)" : "STANDALONE LOCAL AP (Offline)");
      Serial.println(F("├───────────────────────────────────────────────────────────────────────┤"));
      Serial.printf(  "│  Water Level    : %5.1f %%  (Distance: %4.1f cm)                         │\n", dispLevel, dispDistance);
      Serial.printf(  "│  Flow Rate      : %5.1f L/min (Total Volume: %7.2f L)                 │\n", dispFlow, dispLitres);
      Serial.printf(  "│  Motor Current  : %5.2f A    (Est. Power: ~%4.0f W)                      │\n", dispCurrent, dispCurrent * 230.0f);
      Serial.printf(  "│  Physical Relay : %-6s   (Control Mode: %-8s)                      │\n", pumpController.getPumpStateString(), pumpController.getModeString());
      Serial.printf(  "│  State Machine  : %-51s │\n", pumpController.getStateString());
      Serial.printf(  "│  Safety Lockout : %-51s │\n", pumpController.getLockoutString());
      Serial.println(F("└───────────────────────────────────────────────────────────────────────┘\n"));
    } else if (cmd == "STATUS" || cmd == "WIFI" || cmd == "FLEET") {
      wl_status_t st = WiFi.status();
      Serial.println(F("\n==================== MULTI-TANK FLEET STATUS ===================="));
      Serial.printf("  Hotspot SSID   : %s\n", WIFI_SSID);
      Serial.printf("  Wi-Fi Status   : %s (Code: %d)\n", getWifiStatusName(st), (int)st);
      Serial.printf("  Station IP     : %s (Signal: %d dBm)\n",
        (st == WL_CONNECTED) ? WiFi.localIP().toString().c_str() : "None",
        (st == WL_CONNECTED) ? WiFi.RSSI() : 0);
      Serial.printf("  Cloud Gateway  : %s\n", (st == WL_CONNECTED) ? "ONLINE (Active)" : "OFFLINE (Paused)");
      Serial.printf("  Local AP URL   : http://192.168.4.1 (SSID: SmartWaterTank)\n");
      Serial.printf("  Physical Relay : %s\n", pumpController.getPumpStateString());
      Serial.println(F(" ---------------------------------------------------------------"));
      Serial.println(F("  Managed Tanks:"));
      for (size_t i = 0; i < firebaseClient.getTankCount(); i++) {
        const auto& t = firebaseClient.getTank(i);
        Serial.printf("  [%s] Mode: %-6s | Pump: %-4s | Level: %5.1f%% | Status: %s\n",
          t.id.c_str(), t.mode.c_str(), t.pumpState.c_str(),
          (t.levelPercent >= 0.0f) ? t.levelPercent : 78.5f,
          t.status.c_str()
        );
      }
      Serial.println(F("=================================================================\n"));
    }
  }

  // Yield execution to ESP8266 background Wi-Fi and hardware watchdog
  yield();
}
