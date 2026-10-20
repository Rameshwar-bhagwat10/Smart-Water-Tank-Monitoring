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

// Firebase client placeholder
static SmartTank::FirebaseClient firebaseClient("", "", "", "");

// Local Direct Web Dashboard Server (Hosts embedded dashboard at http://192.168.4.1)
static SmartTank::LocalDashboardServer localServer(80);

// Timers for non-blocking execution
static uint32_t lastSensorUpdateMs = 0;
static uint32_t lastSerialLogMs = 0;
static uint32_t flashBtnPressMs = 0;

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

  // 5. Onboarding / Captive Portal Check (If unconfigured or forced)
  if (forcePortal || !SmartTank::ConfigManager::isConfigured()) {
    Serial.println(F("[Onboarding] No saved Wi-Fi configuration found or setup requested."));
    Serial.println(F("[Onboarding] Launching SmartTank Wi-Fi Captive Portal..."));

    SmartTank::CaptivePortal portal;
    portal.start(nullptr, SmartTank::DEFAULT_AP_PASSWORD);

    // Blink Green LED to indicate AP setup mode
    while (!portal.isComplete()) {
      portal.handleClient();
      alertMgr.update(millis(), false, false, SmartTank::SafetyLockout::NONE);
      yield();
    }
  }

  // 6. Load active configuration from EEPROM
  SmartTank::ConfigManager::load(activeConfig);
  Serial.printf("  Active Tank ID : %s\n", activeConfig.tankId);
  Serial.printf("  Device Identity: %s\n", activeConfig.deviceUid);
  Serial.printf("  Target Wi-Fi   : %s\n", activeConfig.wifiSsid);
  Serial.printf("  Firebase Host  : %s\n", activeConfig.firebaseHost);
  Serial.println(F("========================================================="));

  // 7. Calibrate ACS712 zero offset while pump is verified OFF
  Serial.println(F("[Hardware] Calibrating ACS712 zero offset..."));
  currentSensor.calibrateZero();

  // 8. Initialize local autonomous pump state machine
  pumpController.begin();

  // 9. HYBRID WI-FI MODE (WIFI_AP_STA): Broadcast local AP + Connect station
  WiFi.mode(WIFI_AP_STA);
  IPAddress localIp(192, 168, 4, 1);
  WiFi.softAPConfig(localIp, localIp, IPAddress(255, 255, 255, 0));
  String localApSsid = "SmartTank-" + String(activeConfig.tankId);
  WiFi.softAP(localApSsid.c_str(), SmartTank::DEFAULT_AP_PASSWORD);
  Serial.printf("[Hybrid] Local Wi-Fi AP Active: %s (WPA2 secured, connect phone & open http://192.168.4.1)\n", localApSsid.c_str());

  // 10. Start Embedded Local Web Dashboard
  localServer.begin(activeConfig.tankId);

  // 11. Connect Station to home/building Wi-Fi for background cloud sync (if configured)
  firebaseClient = SmartTank::FirebaseClient(
    activeConfig.firebaseHost,
    FIREBASE_AUTH_KEY,
    activeConfig.tankId,
    activeConfig.deviceUid
  );
  if (strlen(activeConfig.wifiSsid) > 0) {
    firebaseClient.begin(activeConfig.wifiSsid, activeConfig.wifiPass);
  }

  // 12. Startup sound notification
  alertMgr.triggerChirp(150);
  Serial.println(F("[System] Hybrid NodeMCU initialization complete. Control loop active."));
  Serial.println(F("[Tip] Type 'SET_TANK <tankId>' or 'RESET_CONFIG' in Serial anytime."));
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
  float levelPercent = ultrasonic.getLevelPercent();
  float distanceCm = ultrasonic.getDistanceCm();
  float flowRateLpm = flowSensor.getFlowRateLpm();
  float totalLitres = flowSensor.getTotalLitres();
  float pumpCurrentA = currentSensor.getLastCurrentA();

  // 2. Local Autonomous Pump Safety Controller (No cloud or router dependency)
  pumpController.update(now, levelPercent, levelValid, flowRateLpm, pumpCurrentA);

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
  if (!levelValid) {
    pkt.sensorStatus = "ERROR";
  } else if (currentLockout != SmartTank::SafetyLockout::NONE) {
    pkt.sensorStatus = "DEGRADED";
  } else {
    pkt.sensorStatus = "OK";
  }
  pkt.isLevelValid = levelValid;
  pkt.timestampMs = now;

  // 5. Serve Direct Phone Connections at http://192.168.4.1
  localServer.handleClient(now, pumpController, pkt);

  // 6. Cloud Telemetry & Command Dispatch (if router is connected)
  if (wifiConnected) {
    firebaseClient.update(now, pumpController, pkt);
  }

  // 7. Periodic Serial Telemetry Stream (~2s)
  if (now - lastSerialLogMs >= 2000) {
    lastSerialLogMs = now;
    Serial.printf(
      "[%s] Level: %.1f%% (%.1f cm) | Flow: %.1f L/min (%.2f L) | Current: %.2f A | Relay: %s | Mode: %s | Lockout: %s | Cloud: %s\n",
      firebaseClient.getTankId().c_str(),
      levelPercent,
      distanceCm,
      flowRateLpm,
      totalLitres,
      pumpCurrentA,
      pumpController.getPumpStateString(),
      pumpController.getModeString(),
      pumpController.getLockoutString(),
      wifiConnected ? "SYNCED" : "LOCAL-ONLY"
    );
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
    } else if (cmd == "STATUS") {
      Serial.printf("[Status] Tank: %s | Cloud: %s | State: %s\n",
        activeConfig.tankId,
        wifiConnected ? "CONNECTED" : "DISCONNECTED",
        pumpController.getPumpStateString()
      );
    }
  }

  // Yield execution to ESP8266 background Wi-Fi and hardware watchdog
  yield();
}
