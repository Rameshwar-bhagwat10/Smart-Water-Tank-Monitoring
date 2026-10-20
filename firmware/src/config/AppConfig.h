#pragma once

#include <Arduino.h>

namespace SmartTank {

// ============================================================================
// HARDWARE PIN DEFINITIONS (ESP8266 NodeMCU v2)
// ============================================================================
constexpr uint8_t PIN_ULTRASONIC_TRIG  = 5;   // D1 / GPIO5  - Ultrasonic Trigger Output
constexpr uint8_t PIN_ULTRASONIC_ECHO  = 4;   // D2 / GPIO4  - Ultrasonic Echo Input (via 1k/2k Divider)
constexpr uint8_t PIN_FLOW_SENSOR      = 14;  // D5 / GPIO14 - ZJ-S201 Flow Sensor Interrupt
constexpr uint8_t PIN_CURRENT_SENSOR   = A0;  // A0 / ADC0   - ACS712 Hall-Effect Analog Input (via Divider)
constexpr uint8_t PIN_RELAY            = 12;  // D6 / GPIO12 - Relay Control Output (Latched Safe at Boot)
constexpr uint8_t PIN_BUZZER           = 13;  // D7 / GPIO13 - Piezo Buzzer Output
constexpr uint8_t PIN_LED_GREEN        = 16;  // D0 / GPIO16 - System / Wi-Fi OK Indicator
constexpr uint8_t PIN_LED_YELLOW       = 15;  // D8 / GPIO15 - Pump Active Indicator (HW-001: Active-HIGH, Cathode to GND)
constexpr uint8_t PIN_LED_RED          = 2;   // D4 / GPIO2  - Fault / Alarm Indicator (HW-001: Active-LOW, Pull-up Boot Safe)
constexpr uint8_t PIN_BUTTON_FLASH     = 0;   // D3 / GPIO0  - Reserved for Onboard Flash/Recovery Button (Pull-up Boot Safe)

// ============================================================================
// RELAY & LED ELECTRICAL POLARITY
// ============================================================================
// Most 5V optocoupler relay modules are active-LOW (LOW = Relay ON, HIGH = Relay OFF).
constexpr bool RELAY_ACTIVE_LOW    = true;
constexpr bool RED_LED_ACTIVE_LOW  = true;  // D4/GPIO2 must be pulled HIGH at boot for normal flash execution

// WPA2-PSK Hotspot Passphrase for SoftAP (SEC-003: minimum 8 characters)
constexpr const char* DEFAULT_AP_PASSWORD = "SmartWaterTank";

// ============================================================================
// SENSOR CALIBRATION DEFAULTS
// ============================================================================
// HC-SR04 Tank Geometry
constexpr float DEFAULT_EMPTY_DISTANCE_CM = 100.0f; // Distance from sensor to empty bottom
constexpr float DEFAULT_FULL_DISTANCE_CM  = 15.0f;  // Distance from sensor to 100% full surface
constexpr float MIN_VALID_DISTANCE_CM     = 2.0f;   // Transducer minimum dead zone
constexpr float MAX_VALID_DISTANCE_CM     = 400.0f; // HC-SR04 maximum acoustic range

// ZJ-S201 Water Flow Sensor
constexpr float DEFAULT_PULSES_PER_LITRE  = 450.0f; // Nominal pulses per litre

// ACS712 Current Sensor (5A Model: 185 mV/A, 20A Model: 100 mV/A)
constexpr float ACS712_SENSITIVITY_MV_PER_A = 185.0f;
constexpr float ACS712_QUIESCENT_MV         = 2500.0f; // Nominal VCC / 2
constexpr float ADC_VOLTAGE_REF_MV          = 3300.0f; // NodeMCU A0 external divider range
constexpr int   ADC_MAX_COUNTS              = 1023;
constexpr float ACS712_DIVIDER_RATIO        = 18.0f / (10.0f + 18.0f); // ~0.642857f (10k upper, 18k lower)

// ============================================================================
// SAFETY INTERLOCKS & OPERATING THRESHOLDS
// ============================================================================
constexpr float AUTO_START_LEVEL_PERCENT   = 20.0f; // Turn ON at or below 20%
constexpr float AUTO_STOP_LEVEL_PERCENT    = 95.0f; // Turn OFF at or above 95%
constexpr float HARD_CUTOFF_LEVEL_PERCENT  = 95.0f; // Strict cutoff in ANY mode

constexpr uint32_t MAX_PUMP_RUNTIME_MS        = 20 * 60 * 1000UL; // 20 min max runtime
constexpr uint32_t DRY_RUN_GRACE_PERIOD_MS    = 15000UL;          // 15s startup grace
constexpr uint32_t DRY_RUN_DETECTION_DELAY_MS = 5000UL;           // 5s sustained 0-flow trip
constexpr uint32_t MIN_SWITCHING_INTERVAL_MS  = 1000UL;           // 1s anti-chatter for responsive testing

// ============================================================================
// CLOUD COMMUNICATION TIMERS
// ============================================================================
constexpr uint32_t TELEMETRY_PUBLISH_INTERVAL_MS = 2000UL; // 2s telemetry updates
constexpr uint32_t COMMAND_POLL_INTERVAL_MS      = 1000UL; // 1s command check
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS    = 10000UL;// 10s Wi-Fi retry

} // namespace SmartTank
