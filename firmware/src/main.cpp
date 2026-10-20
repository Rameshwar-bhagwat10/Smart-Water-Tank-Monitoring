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
  Serial.println(F("[Tip] Type 'STATUS', 'WIFI', 'SET_TANK <id>', or 'RESET_CONFIG' in Serial."));
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

  // 5. Serve Direct Phone Connections at http://192.168.4.1
  localServer.handleClient(now, pumpController, pkt);

  // 6. Cloud Firebase: Push telemetry + Poll remote commands
  firebaseClient.update(now, pumpController, pkt);

  // 7. Periodic Serial Telemetry Stream (~2s)
  if (now - lastSerialLogMs >= 2000) {
    lastSerialLogMs = now;
    if (wifiConnected) {
      Serial.printf(
        "[tank-01] Level: %.1f%% | Flow: %.1f L/m | Current: %.2f A | Relay: %s (%s) | Wi-Fi: ONLINE (%s, %d dBm) | Cloud: ACTIVE | AP: 192.168.4.1\n",
        levelPercent,
        flowRateLpm,
        pumpCurrentA,
        pumpController.getPumpStateString(),
        pumpController.getModeString(),
        WiFi.localIP().toString().c_str(),
        WiFi.RSSI()
      );
    } else {
      Serial.printf(
        "[tank-01] Level: %.1f%% | Flow: %.1f L/m | Current: %.2f A | Relay: %s (%s) | Wi-Fi: OFFLINE | Cloud: PAUSED | Local AP: Active (192.168.4.1)\n",
        levelPercent,
        flowRateLpm,
        pumpCurrentA,
        pumpController.getPumpStateString(),
        pumpController.getModeString()
      );
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
    } else if (cmd == "STATUS" || cmd == "WIFI") {
      wl_status_t st = WiFi.status();
      Serial.println(F("\n==================== SYSTEM & WI-FI STATUS ===================="));
      Serial.printf("  Tank ID        : %s\n", activeConfig.tankId);
      Serial.printf("  Wi-Fi Target   : %s\n", WIFI_SSID);
      Serial.printf("  Wi-Fi Status   : %s (Code: %d)\n", getWifiStatusName(st), (int)st);
      Serial.printf("  Station IP     : %s\n", (st == WL_CONNECTED) ? WiFi.localIP().toString().c_str() : "Not Assigned");
      Serial.printf("  Signal (RSSI)  : %d dBm\n", (st == WL_CONNECTED) ? WiFi.RSSI() : 0);
      Serial.printf("  Cloud Gateway  : %s\n", (st == WL_CONNECTED) ? "ONLINE (Firebase active)" : "PAUSED (Awaiting Wi-Fi)");
      Serial.printf("  Local AP SSID  : %s (Pass: %s)\n", "SmartWaterTank", "SmartWaterTank");
      Serial.printf("  Local AP URL   : http://192.168.4.1\n");
      Serial.printf("  Pump State     : %s (Mode: %s)\n", pumpController.getPumpStateString(), pumpController.getModeString());
      Serial.printf("  Water Level    : %.1f%% (%.1f cm)\n", levelPercent, distanceCm);
      Serial.printf("  Flow Rate      : %.1f L/min (Total: %.2f L)\n", flowRateLpm, totalLitres);
      Serial.printf("  Safety Lockout : %s\n", pumpController.getLockoutString());
      Serial.println(F("===============================================================\n"));
    }
  }

  // Yield execution to ESP8266 background Wi-Fi and hardware watchdog
  yield();
}
