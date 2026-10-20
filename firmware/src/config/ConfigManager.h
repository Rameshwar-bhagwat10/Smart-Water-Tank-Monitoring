#pragma once

#include <Arduino.h>

namespace SmartTank {

struct DeviceConfig {
  char magic[5];          // "STNK\0"
  char wifiSsid[33];      // 32 chars + null
  char wifiPass[65];      // 64 chars + null
  char tankId[17];        // e.g. "tank-01", "tank-02"
  char firebaseHost[81];  // e.g. "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com"
  char deviceUid[33];     // e.g. "device_esp8266_tank01"
  bool configured;        // true if successfully provisioned
  uint16_t checksum;      // Data integrity verification
};

class ConfigManager {
public:
  static void begin();
  static bool load(DeviceConfig& outConfig);
  static bool save(const DeviceConfig& inConfig);
  static void resetToDefaults();
  static bool isConfigured();
  static uint16_t computeChecksum(const DeviceConfig& cfg);
  static void populateFromDefaults(DeviceConfig& cfg);
};

} // namespace SmartTank
