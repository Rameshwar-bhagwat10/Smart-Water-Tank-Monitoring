#include <Arduino.h>
#include "config/AppConfig.h"
#include "config/ConfigManager.h"
#include "portal/CaptivePortal.h"
#include "server/LocalDashboardServer.h"
#include "secrets.h"

#include "sensors/UltrasonicSensor.h"
#include "sensors/FlowSensor.h"
#include "sensors/CurrentSensor.h"
#include "sensors/WaterLevelProbe.h"
#include "control/RelayDriver.h"
#include "control/PumpController.h"
#include "diagnostics/AlertManager.h"
#include "cloud/FirebaseClient.h"

// ============================================================================
// HARDWARE DRIVER INSTANCES (Matching Confirmed Physical Wiring)
// ============================================================================
// 1. HC-SR04 Ultrasonic Distance Sensor (D1 Trig, D2 Echo via 1k/2k Divider)
SmartTank::UltrasonicSensor ultrasonic(
  SmartTank::PIN_ULTRASONIC_TRIG,
  SmartTank::PIN_ULTRASONIC_ECHO,
  SmartTank::DEFAULT_EMPTY_DISTANCE_CM,
  SmartTank::DEFAULT_FULL_DISTANCE_CM
);

// 2. ZJ-S201 Water Flow Sensor (D5 Pulse Input with 10k Pull-up to 3.3V)
SmartTank::FlowSensor flowSensor(
  SmartTank::PIN_FLOW_SENSOR,
  SmartTank::DEFAULT_PULSES_PER_LITRE
);

// 3. ACS712 Hall-Effect Current Sensor (A0 Analog Input)
SmartTank::CurrentSensor currentSensor(
  SmartTank::PIN_CURRENT_SENSOR,
  SmartTank::ACS712_SENSITIVITY_MV_PER_A,
  SmartTank::ACS712_QUIESCENT_MV,
  SmartTank::ACS712_DIVIDER_RATIO
);

// 4. Water-Level Contact Probe / LM393 Comparator Module (D7 Digital Input)
SmartTank::WaterLevelProbe waterProbe(
  SmartTank::PIN_WATER_PROBE_DO,
  SmartTank::WATER_PROBE_ACTIVE_LOW
);

// 5. Optocoupled Relay Module (D6 Control Output - Latched Safe at Boot)
SmartTank::RelayDriver relay(
  SmartTank::PIN_RELAY,
  SmartTank::RELAY_ACTIVE_LOW
);

// 6. Diagnostics & Audio Alerts (D0 Buzzer Positive)
SmartTank::AlertManager alertMgr(
  SmartTank::PIN_LED_GREEN,
  SmartTank::PIN_LED_YELLOW,
  SmartTank::PIN_LED_RED,
  SmartTank::PIN_BUZZER,
  SmartTank::RED_LED_ACTIVE_LOW
);

// 7. Local Autonomous Pump Safety Controller (Default: Safe MANUAL Mode)
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
  Serial.println(F("  Firmware Updated for Confirmed Physical Wiring        "));
  Serial.println(F("========================================================="));

  // 1. Initialize Relay FIRST (De-energizes pin BEFORE setting OUTPUT mode)
  relay.begin();
  Serial.printf("[Boot] Relay on D6 / GPIO12 initialized: %s (Active-LOW: %s)\n",
    relay.getStateString(), SmartTank::RELAY_ACTIVE_LOW ? "YES" : "NO");

  // 2. Report Pin Assignments
  Serial.println(F("[Hardware] Pin Mapping Configuration:"));
  Serial.printf("  - D0 / GPIO16 : Piezo Buzzer Output (3.3V)\n");
  Serial.printf("  - D1 / GPIO5  : HC-SR04 Ultrasonic Trigger\n");
  Serial.printf("  - D2 / GPIO4  : HC-SR04 Ultrasonic Echo (via 1k/2k Divider)\n");
  Serial.printf("  - D3 / GPIO0  : Onboard Flash Button (Reset / Recovery)\n");
  Serial.printf("  - D5 / GPIO14 : ZJ-S201 Flow Sensor (10k Pull-up to 3.3V)\n");
  Serial.printf("  - D6 / GPIO12 : Relay Module Control (Safe Latched OFF)\n");
  Serial.printf("  - D7 / GPIO13 : Water-Level Probe Comparator DO\n");
  Serial.printf("  - A0 / ADC0   : ACS712 Current Sensor Analog OUT\n");

  // 3. Initialize Diagnostics & Transducers
  alertMgr.begin();
  ultrasonic.begin();
  flowSensor.begin();
  currentSensor.begin();
  waterProbe.begin();
  Serial.println(F("[Hardware] Transducers initialized successfully."));

  // 4. Initialize Flash Button (GPIO0 / D3)
  pinMode(SmartTank::PIN_BUTTON_FLASH, INPUT_PULLUP);

  // 5. Initialize Non-Volatile Configuration Store
  SmartTank::ConfigManager::begin();

  // Check if Flash button is held down at boot (Manual Setup Force)
  bool forcePortal = (digitalRead(SmartTank::PIN_BUTTON_FLASH) == LOW);
  if (forcePortal) {
    Serial.println(F("[Boot] Flash button held at power-up. Forcing Captive Portal..."));
  }

  // 6. Initialize local autonomous pump state machine (Boot in Safe MANUAL Mode)
  pumpController.begin();
  Serial.printf("[Safety] Controller Mode: %s | Relay: %s (Auto-pumping disabled for bench testing)\n",
    pumpController.getModeString(), pumpController.getPumpStateString());

  // 7. Calibrate ACS712 zero offset while pump is verified OFF
  Serial.println(F("[Hardware] Calibrating ACS712 zero offset at no-load baseline..."));
  currentSensor.calibrateZero();
  Serial.printf("  -> Raw ADC Offset: %d counts (~%.1f mV)\n",
    currentSensor.getLastRawAdc(), currentSensor.getZeroOffsetMv());

  // 8. DUAL MODE: Local AP + Cloud Router Connection (AP_STA)
  WiFi.mode(WIFI_AP_STA);
  IPAddress localIp(192, 168, 4, 1);
  WiFi.softAPConfig(localIp, localIp, IPAddress(255, 255, 255, 0));
  const char* apSsid = "SmartWaterTank";
  const char* apPass = SmartTank::DEFAULT_AP_PASSWORD;
  WiFi.softAP(apSsid, apPass);

  // 9. Start Instant Embedded Local Web Dashboard FIRST
  localServer.begin(TANK_ID);

  Serial.println(F("========================================================="));
  Serial.printf("[Local] Wi-Fi AP SSID  : %s\n", apSsid);
  Serial.printf("[Local] Wi-Fi AP Pass  : %s\n", apPass);
  Serial.println(F("[Local] Dashboard URL  : http://192.168.4.1"));
  Serial.println(F("========================================================="));

  // 10. Connect to Hotspot for Cloud Firebase Access
  Serial.printf("[Wi-Fi] Connecting to hotspot '%s'...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 8000) {
    delay(400);
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
    Serial.println(F("========================================================="));
    alertMgr.triggerChirp(120);
  } else {
    wl_status_t st = WiFi.status();
    Serial.println(F("========================================================="));
    Serial.println(F("  >>> [Wi-Fi] HOTSPOT NOT DETECTED / STANDALONE LOCAL <<<"));
    Serial.printf("  Target SSID: %s\n", WIFI_SSID);
    Serial.printf("  Status     : %s (Code: %d)\n", getWifiStatusName(st), (int)st);
    Serial.println(F("  Cloud      : PAUSED (Requires Wi-Fi hotspot connection)"));
    Serial.println(F("  Action     : LOCAL DASHBOARD READY at http://192.168.4.1"));
    Serial.println(F("========================================================="));
    alertMgr.triggerChirp(300);
  }

  Serial.println(F("[System] Ready. Type 'HELP' in Serial to see commands."));
}

void loop() {
  uint32_t now = millis();

  // 1. Periodic Sensor Acquisition (~200ms non-blocking)
  static float recentPeakFlowLpm = 0.0f;
  if (now - lastSensorUpdateMs >= 200) {
    uint32_t delta = now - lastSensorUpdateMs;
    lastSensorUpdateMs = now;

    ultrasonic.measure();
    flowSensor.update(delta);
    if (flowSensor.getFlowRateLpm() > recentPeakFlowLpm) {
      recentPeakFlowLpm = flowSensor.getFlowRateLpm();
    }
    currentSensor.measureDcCurrent(32);
    waterProbe.update();
  }

  bool levelValid = ultrasonic.isReadingValid();
  bool levelStale = ultrasonic.isStale(now, 5000UL);
  float levelPercent = ultrasonic.getLevelPercent();
  float distanceCm = ultrasonic.getDistanceCm();
  float flowRateLpm = flowSensor.getFlowRateLpm();
  float totalLitres = flowSensor.getTotalLitres();
  float pumpCurrentA = currentSensor.getLastCurrentA();
  int rawAdc = currentSensor.getLastRawAdc();
  bool probeDetected = waterProbe.isWaterDetected();
  uint32_t flowPulses = flowSensor.getCumulativePulses();

  // 2. Local Autonomous Pump Safety Controller (No cloud or router dependency)
  pumpController.update(now, levelPercent, levelValid, flowRateLpm, pumpCurrentA, levelStale,
                        probeDetected, SmartTank::WATER_PROBE_IS_OVERFLOW_INTERLOCK);

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
  pkt.rawAdc = rawAdc;
  pkt.waterProbeDetected = probeDetected;
  pkt.flowPulses = flowPulses;
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
  localServer.handleClient(now, pumpController, pkt, &alertMgr, &firebaseClient);

  // 6. Cloud Firebase: Real-time telemetry push + sub-second command polling
  // When a local phone is active on http://192.168.4.1, rate-limit cloud polling to 1500ms
  // so the local web server gets 100% CPU priority and sub-millisecond responsiveness!
  if (!localServer.hasRecentClient()) {
    firebaseClient.update(now, pumpController, pkt, &alertMgr);
  } else {
    static uint32_t lastLocalActiveCloudPollMs = 0;
    if (now - lastLocalActiveCloudPollMs >= 1500) {
      lastLocalActiveCloudPollMs = now;
      firebaseClient.update(now, pumpController, pkt, &alertMgr);
    }
  }

  // 7. Periodic Sensor Diagnostics Stream (~2s)
  if (now - lastSerialLogMs >= 2000) {
    lastSerialLogMs = now;

    float dispLevel = (levelPercent >= 0.0f) ? levelPercent : 0.0f;
    float dispDistance = (distanceCm >= 0.0f) ? distanceCm : 0.0f;
    const char* sonicStatus = ultrasonic.getStatusString();

    Serial.println(F("┌────────────────────── SENSOR DIAGNOSTICS MONITOR ─────────────────────┐"));
    Serial.printf(  "│  Active Tank     : %-51s │\n", activeConfig.tankId[0] ? activeConfig.tankId : TANK_ID);
    Serial.printf(  "│  Network Mode    : %-51s │\n",
      wifiConnected ? "CLOUD ONLINE + LOCAL AP (192.168.4.1)" : "STANDALONE LOCAL AP (http://192.168.4.1)");
    Serial.println(F("├───────────────────────────────────────────────────────────────────────┤"));
    Serial.printf(  "│  [1] Ultrasonic  : %5.1f %%  (Dist: %5.1f cm | Status: %-13s)    │\n",
      dispLevel, dispDistance, sonicStatus);
    Serial.printf(  "│  [2] Flow Sensor : %5.1f L/min (Peak: %4.1f | Pulses: %-5lu | Vol: %5.2f L) │\n",
      flowRateLpm, recentPeakFlowLpm, (unsigned long)flowPulses, totalLitres);
    recentPeakFlowLpm = flowRateLpm; // Reset peak window for next 2-second cycle
    Serial.printf(  "│  [3] Water Probe : %-14s (D7 Pin: %-4s | Active-LOW: %-3s)     │\n",
      waterProbe.getStatusString(),
      waterProbe.getRawPinState() == LOW ? "LOW" : "HIGH",
      waterProbe.isActiveLow() ? "YES" : "NO");
    Serial.printf(  "│  [4] ACS712 (A0) : %5.2f A    (Raw ADC: %-4d | Zero: %4.0f mV)         │\n",
      pumpCurrentA, rawAdc, currentSensor.getZeroOffsetMv());
    Serial.printf(  "│  [5] Relay (D6)  : %-4s     (Active-%-4s | Mode: %-6s)              │\n",
      pumpController.getPumpStateString(),
      relay.isActiveLow() ? "LOW " : "HIGH",
      pumpController.getModeString());
    Serial.printf(  "│  [6] State/Lock  : %-15s (Lockout: %-18s) │\n",
      pumpController.getStateString(), pumpController.getLockoutString());
    Serial.println(F("└───────────────────────────────────────────────────────────────────────┘"));
  }

  // 8. Check Hardware Flash Button for Runtime Reset (Hold for 5s)
  if (digitalRead(SmartTank::PIN_BUTTON_FLASH) == LOW) {
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

  // 9. Serial Console Commands for Rapid Bench Testing
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "RELAY ON" || cmd == "PUMP ON" || cmd == "START" || cmd == "ON") {
      pumpController.requestMode(SmartTank::ControlMode::MANUAL, now);
      SmartTank::CommandResult res = pumpController.requestManualPump(true, now);
      Serial.println();
      Serial.println(F("╔══════════════════════════════════════════════════════════════════════╗"));
      Serial.printf(  "║   ⚡ RELAY COMMAND: ENERGIZE (TEST CLICK)                            ║\n");
      Serial.printf(  "║   Result         : %-49s ║\n", res.accepted ? "ACCEPTED & EXECUTED" : (res.reason ? res.reason : "BLOCKED"));
      Serial.printf(  "║   Physical Relay : %-49s ║\n", pumpController.getPumpStateString());
      Serial.printf(  "║   Control Mode   : %-49s ║\n", pumpController.getModeString());
      Serial.printf(  "║   State Machine  : %-49s ║\n", pumpController.getStateString());
      Serial.println(F("╚══════════════════════════════════════════════════════════════════════╝"));
      alertMgr.triggerChirp(80);
      lastSerialLogMs = 0;
    } else if (cmd == "RELAY OFF" || cmd == "PUMP OFF" || cmd == "STOP" || cmd == "OFF") {
      pumpController.requestMode(SmartTank::ControlMode::MANUAL, now);
      SmartTank::CommandResult res = pumpController.requestManualPump(false, now);
      Serial.println();
      Serial.println(F("╔══════════════════════════════════════════════════════════════════════╗"));
      Serial.printf(  "║   🛑 RELAY COMMAND: DE-ENERGIZE (OFF)                                ║\n");
      Serial.printf(  "║   Result         : %-49s ║\n", res.accepted ? "ACCEPTED & EXECUTED" : (res.reason ? res.reason : "BLOCKED"));
      Serial.printf(  "║   Physical Relay : %-49s ║\n", pumpController.getPumpStateString());
      Serial.printf(  "║   Control Mode   : %-49s ║\n", pumpController.getModeString());
      Serial.printf(  "║   State Machine  : %-49s ║\n", pumpController.getStateString());
      Serial.println(F("╚══════════════════════════════════════════════════════════════════════╝"));
      alertMgr.triggerChirp(80);
      lastSerialLogMs = 0;
    } else if (cmd == "CLICK" || cmd == "TEST_RELAY") {
      // Direct relay hardware actuation test for 1000ms (bypasses tank interlocks for coil diagnostics)
      Serial.println(F("\n[Hardware Test] Actuating Relay coil directly for 1000ms on D6..."));
      relay.setPump(true);
      alertMgr.triggerChirp(80);
      delay(1000);
      relay.setPump(false);
      alertMgr.triggerChirp(80);
      Serial.println(F("[Hardware Test] Relay returned to safe de-energized state.\n"));
      lastSerialLogMs = 0;
    } else if (cmd == "AUTO") {
      pumpController.requestMode(SmartTank::ControlMode::AUTO, now);
      Serial.println(F("\n[Serial Command] >>> Control Mode switched to AUTO (Hysteresis Active) <<<\n"));
      alertMgr.triggerChirp(80);
      lastSerialLogMs = 0;
    } else if (cmd == "MANUAL") {
      pumpController.requestMode(SmartTank::ControlMode::MANUAL, now);
      Serial.println(F("\n[Serial Command] >>> Control Mode switched to MANUAL (Pump Disabled) <<<\n"));
      alertMgr.triggerChirp(80);
      lastSerialLogMs = 0;
    } else if (cmd == "PROBE") {
      waterProbe.update();
      Serial.println(F("\n================= WATER-LEVEL PROBE DIAGNOSTIC ================="));
      Serial.printf("  DO Pin         : NodeMCU D7 / GPIO13\n");
      Serial.printf("  Raw Pin Level  : %s\n", waterProbe.getRawPinState() == LOW ? "LOW (0V)" : "HIGH (3.3V)");
      Serial.printf("  Config Polarity: %s\n", waterProbe.isActiveLow() ? "Active-LOW (LOW = Water Detected)" : "Active-HIGH");
      Serial.printf("  Current Status : %s\n", waterProbe.getStatusString());
      Serial.println(F("================================================================\n"));
    } else if (cmd == "PROBE_POLARITY_LOW") {
      waterProbe.setActiveLow(true);
      Serial.println(F("[Config] Water-level probe polarity set to Active-LOW (default)."));
    } else if (cmd == "PROBE_POLARITY_HIGH") {
      waterProbe.setActiveLow(false);
      Serial.println(F("[Config] Water-level probe polarity set to Active-HIGH."));
    } else if (cmd == "RELAY_POLARITY_LOW") {
      relay.setActiveLow(true);
      Serial.println(F("[Config] Relay module polarity set to Active-LOW (default: LOW = Relay ON)."));
    } else if (cmd == "RELAY_POLARITY_HIGH") {
      relay.setActiveLow(false);
      Serial.println(F("[Config] Relay module polarity set to Active-HIGH (HIGH = Relay ON)."));
    } else if (cmd == "CAL_ZERO") {
      Serial.println(F("[Hardware] Recalibrating ACS712 zero offset at current no-load condition..."));
      currentSensor.calibrateZero();
      Serial.printf("  -> New Zero Offset: %d ADC counts (~%.1f mV)\n",
        currentSensor.getLastRawAdc(), currentSensor.getZeroOffsetMv());
    } else if (cmd == "SONIC" || cmd == "ECHO") {
      Serial.println(F("\n================ ULTRASONIC HARDWARE DIAGNOSTIC ================"));
      Serial.printf("  Trig Pin (Output)    : NodeMCU D1 / GPIO %d\n", SmartTank::PIN_ULTRASONIC_TRIG);
      Serial.printf("  Echo Pin (Input)     : NodeMCU D2 / GPIO %d\n", SmartTank::PIN_ULTRASONIC_ECHO);
      
      int idleEcho = digitalRead(SmartTank::PIN_ULTRASONIC_ECHO);
      Serial.printf("  Echo Pin Idle State  : %s\n", idleEcho == HIGH ? "HIGH (Warning: Pin is stuck HIGH!)" : "LOW (Normal)");

      // Send 10µs trigger pulse
      digitalWrite(SmartTank::PIN_ULTRASONIC_TRIG, LOW);
      delayMicroseconds(4);
      digitalWrite(SmartTank::PIN_ULTRASONIC_TRIG, HIGH);
      delayMicroseconds(10);
      digitalWrite(SmartTank::PIN_ULTRASONIC_TRIG, LOW);

      unsigned long dur = pulseIn(SmartTank::PIN_ULTRASONIC_ECHO, HIGH, 35000);
      Serial.printf("  Pulse Return Duration: %lu us\n", dur);
      if (dur > 0) {
        float dist = (dur * 0.0343f) / 2.0f;
        Serial.printf("  >>> SUCCESS! Distance: %.1f cm <<<\n", dist);
      } else {
        if (idleEcho == HIGH) {
          Serial.println(F("  FAIL: Echo pin is stuck HIGH. Check resistor wiring."));
        } else {
          Serial.println(F("  FAIL: No pulse received (0 us)."));
          Serial.println(F("        1. Check that HC-SR04 VCC is connected to NodeMCU VIN / 5V rail."));
          Serial.println(F("        2. Check that HC-SR04 GND is connected to NodeMCU GND."));
          Serial.println(F("        3. Check if TRIG (D1) and ECHO (D2) wires are swapped."));
        }
      }
      Serial.println(F("================================================================\n"));
    } else if (cmd == "FLOW") {
      Serial.println(F("\n================= FLOW SENSOR DIAGNOSTIC ================="));
      Serial.printf("  Signal Pin (Input)   : NodeMCU D5 / GPIO %d\n", SmartTank::PIN_FLOW_SENSOR);
      Serial.printf("  Current Flow Rate    : %.2f L/min\n", flowSensor.getFlowRateLpm());
      Serial.printf("  Recent Peak Flow     : %.2f L/min\n", recentPeakFlowLpm);
      Serial.printf("  Cumulative Pulses    : %lu pulses\n", (unsigned long)flowSensor.getCumulativePulses());
      Serial.printf("  Total Volume (Litres): %.2f L\n", flowSensor.getTotalLitres());
      Serial.printf("  Calibration Constant : %.1f pulses/Litre\n", flowSensor.getCalibration());
      Serial.println(F("==========================================================\n"));
    } else if (cmd.startsWith("BEEP") || cmd.startsWith("BUZZER")) {
      uint16_t duration = 1000; // 1-second loud beep
      if (cmd.indexOf(' ') > 0) {
        int parsed = cmd.substring(cmd.indexOf(' ') + 1).toInt();
        if (parsed > 0) {
          duration = (parsed <= 10) ? (parsed * 1000) : parsed;
        }
      }
      Serial.printf("\n[Hardware Test] Playing LOUD %d ms audio alert tone on D0 (2.5 kHz resonant square-wave)...\n", duration);
      alertMgr.playTone(2500, duration);
      Serial.println(F("[Hardware Test] Buzzer test completed.\n"));
    } else if (cmd == "RESET_FLOW") {
      flowSensor.resetTotalLitres();
      recentPeakFlowLpm = 0.0f;
      Serial.println(F("[Flow] Volume and pulse counter reset to 0."));
    } else if (cmd == "HELP" || cmd == "?") {
      Serial.println(F("\n==================== BENCH TEST SERIAL CONSOLE ===================="));
      Serial.println(F("  RELAY ON  / PUMP ON   - Switch to MANUAL and actuate relay ON (listen for click)"));
      Serial.println(F("  RELAY OFF / PUMP OFF  - Switch to MANUAL and de-energize relay OFF"));
      Serial.println(F("  CLICK                 - Safe 500ms momentary relay click test"));
      Serial.println(F("  AUTO                  - Enable autonomous hysteresis control (20%-95%)"));
      Serial.println(F("  MANUAL                - Disable automatic pumping (safe bench state)"));
      Serial.println(F("  PROBE                 - Read D7 water-level probe comparator status"));
      Serial.println(F("  PROBE_POLARITY_LOW    - Set probe logic to Active-LOW (default)"));
      Serial.println(F("  PROBE_POLARITY_HIGH   - Set probe logic to Active-HIGH"));
      Serial.println(F("  RELAY_POLARITY_LOW    - Set relay logic to Active-LOW (default)"));
      Serial.println(F("  RELAY_POLARITY_HIGH   - Set relay logic to Active-HIGH"));
      Serial.println(F("  FLOW                  - Print instantaneous, peak, and cumulative flow stats"));
      Serial.println(F("  RESET_FLOW            - Reset flow pulse counter and total volume to 0"));
      Serial.println(F("  CAL_ZERO              - Recalibrate ACS712 current zero-offset baseline"));
      Serial.println(F("  BEEP / BUZZER         - Trigger 300ms audio test chirp on D0 buzzer"));
      Serial.println(F("  SONIC                 - Diagnostic pulse test for ultrasonic sensor"));
      Serial.println(F("  LOCAL                 - Print instant sensor diagnostics banner"));
      Serial.println(F("  STATUS / FLEET        - Print Wi-Fi and Firebase cloud sync status"));
      Serial.println(F("  SET_TANK <id>         - Switch active tank target (e.g. SET_TANK tank-01)"));
      Serial.println(F("  SET_WIFI <ssid> <pwd> - Connect to specific Wi-Fi hotspot"));
      Serial.println(F("  RESET_CONFIG          - Clear EEPROM and reboot to Setup Portal"));
      Serial.println(F("===================================================================\n"));
    } else if (cmd.startsWith("SET_WIFI")) {
      int firstSpace = cmd.indexOf(' ');
      int secondSpace = cmd.indexOf(' ', firstSpace + 1);
      if (firstSpace > 0 && secondSpace > 0) {
        String newSsid = cmd.substring(firstSpace + 1, secondSpace);
        String newPass = cmd.substring(secondSpace + 1);
        newSsid.trim(); newPass.trim();
        Serial.printf("\n[Wi-Fi] Initiating connection to '%s'...\n", newSsid.c_str());
        firebaseClient.begin(newSsid, newPass);
      } else {
        Serial.println(F("\nUsage: SET_WIFI <ssid> <password>\n"));
      }
    } else if (cmd == "LOCAL") {
      lastSerialLogMs = 0;
    } else if (cmd == "STATUS" || cmd == "WIFI" || cmd == "FLEET") {
      wl_status_t st = WiFi.status();
      Serial.println(F("\n==================== SYSTEM & FLEET STATUS ===================="));
      Serial.printf("  Hotspot SSID   : %s\n", WIFI_SSID);
      Serial.printf("  Wi-Fi Status   : %s (Code: %d)\n", getWifiStatusName(st), (int)st);
      Serial.printf("  Station IP     : %s (Signal: %d dBm)\n",
        (st == WL_CONNECTED) ? WiFi.localIP().toString().c_str() : "None",
        (st == WL_CONNECTED) ? WiFi.RSSI() : 0);
      Serial.printf("  Cloud Gateway  : %s\n", (st == WL_CONNECTED) ? "ONLINE (Active)" : "OFFLINE (Paused)");
      Serial.printf("  Local AP URL   : http://192.168.4.1 (SSID: SmartWaterTank)\n");
      Serial.printf("  Physical Relay : %s (D6 / GPIO12)\n", pumpController.getPumpStateString());
      Serial.println(F(" ---------------------------------------------------------------"));
      Serial.println(F("  Managed Tanks:"));
      for (size_t i = 0; i < firebaseClient.getTankCount(); i++) {
        const auto& t = firebaseClient.getTank(i);
        Serial.printf("  [%s] Mode: %-6s | Pump: %-4s | Level: %5.1f%% | Status: %s\n",
          t.id.c_str(), t.mode.c_str(), t.pumpState.c_str(),
          (t.levelPercent >= 0.0f) ? t.levelPercent : 0.0f,
          t.status.c_str()
        );
      }
      Serial.println(F("================================================================\n"));
    }
  }

  // Yield execution to ESP8266 background Wi-Fi and hardware watchdog
  yield();
}
