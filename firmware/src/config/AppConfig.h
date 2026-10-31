#pragma once

#include <Arduino.h>

namespace SmartTank {

// ============================================================================
// HARDWARE PIN DEFINITIONS (ESP8266 NodeMCU v2 / ESP-12E)
// Confirmed Physical Breadboard Wiring:
//   D0 -> GPIO16: Buzzer Positive (3.3V, Negative to common GND)
//   D1 -> GPIO5 : HC-SR04 Ultrasonic Trigger Output
//   D2 -> GPIO4 : HC-SR04 Ultrasonic Echo Input (via 1k / 2k Divider)
//   D3 -> GPIO0 : Onboard FLASH Button (Pull-up Boot Safe / 5s Factory Reset)
//   D4 -> GPIO2 : Onboard Blue LED (Active-LOW, Boot Safe Pull-up)
//   D5 -> GPIO14: ZJ-S201 Flow Sensor Signal (10k Pull-up to 3.3V)
//   D6 -> GPIO12: Relay Module IN (3.3V Logic Safe, Latched Safe OFF at Boot)
//   D7 -> GPIO13: Water-Level Probe Comparator Digital Output (DO)
//   D8 -> GPIO15: Unused (Must be pulled LOW for normal boot execution)
//   A0 -> ADC0  : ACS712 Current Sensor Analog Input (0..3.3V range)
// ============================================================================
constexpr uint8_t PIN_BUZZER          = 16; // NodeMCU D0 / GPIO16 - Piezo Buzzer Positive
constexpr uint8_t PIN_ULTRASONIC_TRIG = 5;  // NodeMCU D1 / GPIO5  - Ultrasonic Trigger Output
constexpr uint8_t PIN_ULTRASONIC_ECHO = 4;  // NodeMCU D2 / GPIO4  - Ultrasonic Echo Input (via 1k/2k Divider)
constexpr uint8_t PIN_BUTTON_FLASH    = 0;  // NodeMCU D3 / GPIO0  - Onboard Flash Button (Pull-up Boot Safe)
constexpr uint8_t PIN_FLOW_SENSOR     = 14; // NodeMCU D5 / GPIO14 - ZJ-S201 Flow Sensor (10k Pull-up to 3.3V)
constexpr uint8_t PIN_RELAY           = 12; // NodeMCU D6 / GPIO12 - Relay Control Output (Latched Safe at Boot)
constexpr uint8_t PIN_WATER_PROBE_DO  = 13; // NodeMCU D7 / GPIO13 - Water-Level Probe Comparator DO
constexpr uint8_t PIN_CURRENT_SENSOR  = A0; // NodeMCU A0 / ADC0   - ACS712 Current Sensor Analog Input

// Status Indicators (Unwired pins set to PIN_UNUSED / 255 to prevent GPIO conflicts)
constexpr uint8_t PIN_UNUSED          = 255;
constexpr uint8_t PIN_LED_GREEN       = PIN_UNUSED; // D0 is now dedicated to Buzzer
constexpr uint8_t PIN_LED_YELLOW      = PIN_UNUSED; // Not wired in breadboard setup
constexpr uint8_t PIN_LED_RED         = 2;          // NodeMCU D4 / GPIO2 - Onboard ESP-12E Blue LED (Active-LOW)

// ============================================================================
// ELECTRICAL POLARITY & LOGIC MODES
// ============================================================================
// Most 5V optocoupler relay modules are active-LOW (LOW = Relay ON / Energized, HIGH = Relay OFF / Safe).
// Set to true for active-LOW, or false for active-HIGH.
constexpr bool RELAY_ACTIVE_LOW       = true;

// Water-level probe comparator digital output (LM393):
// Active-LOW (true): DO goes LOW when water bridges the probe contacts.
// Active-HIGH (false): DO goes HIGH when water is detected.
constexpr bool WATER_PROBE_ACTIVE_LOW = true;

// Water-level probe mounting function:
// If true, the probe acts as a high-water / overflow emergency interlock.
// When water is detected by the probe, the pump is immediately forced OFF across all modes (including MANUAL).
// [UNVERIFIED PLACEMENT]: Set to true if probe is physically mounted at high-water overflow level.
constexpr bool WATER_PROBE_IS_OVERFLOW_INTERLOCK = true;

// Onboard ESP-12E Blue LED polarity (D4 / GPIO2): Active-LOW
constexpr bool RED_LED_ACTIVE_LOW     = true;

// Startup Safety Mode:
// When true, boots in MANUAL mode with pump OFF so automatic pump control is disabled
// until explicitly configured and tested. Safe for bench testing with pump disconnected.
constexpr bool DEFAULT_STARTUP_IN_MANUAL_MODE = true;

// WPA2-PSK Hotspot Passphrase for SoftAP (SEC-003: minimum 8 characters)
constexpr const char* DEFAULT_AP_PASSWORD = "SmartWaterTank";

// ============================================================================
// SENSOR CALIBRATION DEFAULTS (MARKED FOR BENCH CALIBRATION)
// ============================================================================
// HC-SR04 Tank Geometry Calibration
constexpr float DEFAULT_EMPTY_DISTANCE_CM = 100.0f; // Distance from transducer to empty tank bottom
constexpr float DEFAULT_FULL_DISTANCE_CM  = 15.0f;  // Distance from transducer to 100% full water surface
constexpr float MIN_VALID_DISTANCE_CM     = 2.0f;   // Transducer minimum acoustic dead zone
constexpr float MAX_VALID_DISTANCE_CM     = 400.0f; // HC-SR04 maximum acoustic range

// ZJ-S201 Water Flow Sensor Calibration
// Factory nominal formula: Frequency F (Hz) = 7.5 * Flow (L/min)
// Pulses per Litre = 7.5 * 60 = 450.0 pulses/L.
// [UNVERIFIED / PROVISIONAL]: Must be calibrated against a physical measured bucket test.
constexpr float DEFAULT_PULSES_PER_LITRE  = 450.0f;

// ACS712 Current Sensor Calibration
// Supported variants:
//   ACS712-05B: 185.0 mV/A (±5A full scale)
//   ACS712-20A: 100.0 mV/A (±20A full scale)
//   ACS712-30A:  66.0 mV/A (±30A full scale)
// [UNVERIFIED VARIANT]: Default configured for 5A variant. Check physical chip marking!
constexpr float ACS712_SENSITIVITY_05B_MV_PER_A = 185.0f;
constexpr float ACS712_SENSITIVITY_20A_MV_PER_A = 100.0f;
constexpr float ACS712_SENSITIVITY_30A_MV_PER_A =  66.0f;

// Active sensitivity setting:
constexpr float ACS712_SENSITIVITY_MV_PER_A = ACS712_SENSITIVITY_05B_MV_PER_A;
constexpr float ACS712_QUIESCENT_MV         = 2500.0f; // Nominal VCC / 2 (2.5V at 0A)

// NodeMCU External A0 Input Range:
// NodeMCU has an onboard 220k/100k resistor divider scaling external 0..3.3V to 0..1.0V at ESP8266 TOUT.
// Firmware assumes external A0 range of 0..3300 mV (10-bit ADC, 0..1023 counts).
constexpr float ADC_VOLTAGE_REF_MV          = 3300.0f;
constexpr int   ADC_MAX_COUNTS              = 1023;

// Voltage Divider on A0:
// Confirmed wiring: ACS712 OUT connects DIRECTLY to NodeMCU A0 (NO external divider installed).
// Software divider ratio is strictly 1.0f (direct 1:1 input).
constexpr float ACS712_DIVIDER_RATIO        = 1.0f;

// ============================================================================
// SAFETY INTERLOCKS & OPERATING THRESHOLDS
// ============================================================================
constexpr float AUTO_START_LEVEL_PERCENT   = 20.0f; // Turn ON at or below 20% (when in AUTO mode)
constexpr float AUTO_STOP_LEVEL_PERCENT    = 95.0f; // Turn OFF at or above 95%
constexpr float HARD_CUTOFF_LEVEL_PERCENT  = 95.0f; // Strict safety cutoff enforced across all modes

constexpr uint32_t MAX_PUMP_RUNTIME_MS        = 20 * 60 * 1000UL; // 20 min max continuous runtime

// Dry-Run Protection (Zero-Flow Detection):
// During sensor-only bench testing with pump disconnected, keep FALSE to prevent nuisance trips.
// Enable only after external pump and plumbing are connected and primed.
constexpr bool     DRY_RUN_PROTECTION_ENABLED = false;   // [BENCH TEST SAFE - KEEP FALSE WHILE PUMP DISCONNECTED]
constexpr float    DRY_RUN_FLOW_THRESHOLD_LPM = 0.2f;    // Flow below this indicates zero-flow / dry run
constexpr uint32_t DRY_RUN_GRACE_PERIOD_MS    = 15000UL; // 15s startup grace period for line priming
constexpr uint32_t DRY_RUN_DETECTION_DELAY_MS = 5000UL;  // 5s sustained zero-flow before tripping
constexpr uint32_t MIN_SWITCHING_INTERVAL_MS  = 250UL;   // 250ms anti-chatter rate limit

// ============================================================================
// CLOUD COMMUNICATION TIMERS (Ultra-Fast Responsive Mode)
// ============================================================================
constexpr uint32_t TELEMETRY_PUBLISH_INTERVAL_MS = 1000UL; // 1s smooth telemetry updates
constexpr uint32_t COMMAND_POLL_INTERVAL_MS      = 250UL;  // 250ms sub-second command polling
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS    = 15000UL;// 15s Wi-Fi background retry

} // namespace SmartTank
