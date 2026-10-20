#include "ConfigManager.h"
#include <EEPROM.h>
#include "secrets.h"

namespace SmartTank {

static const char MAGIC_KEY[5] = "STNK";
static constexpr size_t EEPROM_SIZE = 512;

uint16_t ConfigManager::computeChecksum(const DeviceConfig& cfg) {
  const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&cfg);
  size_t len = sizeof(DeviceConfig) - sizeof(cfg.checksum);
  uint16_t sum = 0xABCD;
  for (size_t i = 0; i < len; ++i) {
    sum = (sum << 1) ^ bytes[i];
  }
  return sum;
}

void ConfigManager::begin() {
  EEPROM.begin(EEPROM_SIZE);
}

bool ConfigManager::isConfigured() {
  DeviceConfig cfg;
  EEPROM.get(0, cfg);
  if (strncmp(cfg.magic, MAGIC_KEY, 4) != 0) {
    return false;
  }
  if (!cfg.configured) {
    return false;
  }
  return (cfg.checksum == computeChecksum(cfg));
}

bool ConfigManager::load(DeviceConfig& outConfig) {
  if (isConfigured()) {
    EEPROM.get(0, outConfig);
    return true;
  }
  // Not yet configured via portal; fall back to compile-time defaults
  populateFromDefaults(outConfig);
  return false;
}

bool ConfigManager::save(const DeviceConfig& inConfig) {
  DeviceConfig toWrite = inConfig;
  strncpy(toWrite.magic, MAGIC_KEY, sizeof(toWrite.magic));
  toWrite.configured = true;
  toWrite.checksum = computeChecksum(toWrite);

  EEPROM.put(0, toWrite);
  bool success = EEPROM.commit();
  Serial.printf("[ConfigManager] Saved config for tank: %s (commit: %s)\n", toWrite.tankId, success ? "OK" : "FAILED");
  return success;
}

void ConfigManager::resetToDefaults() {
  DeviceConfig emptyCfg;
  memset(&emptyCfg, 0, sizeof(DeviceConfig));
  EEPROM.put(0, emptyCfg);
  EEPROM.commit();
  Serial.println(F("[ConfigManager] EEPROM cleared. Device reset to unprovisioned state."));
}

void ConfigManager::populateFromDefaults(DeviceConfig& cfg) {
  memset(&cfg, 0, sizeof(DeviceConfig));
  strncpy(cfg.magic, MAGIC_KEY, sizeof(cfg.magic));

#ifdef WIFI_SSID
  strncpy(cfg.wifiSsid, WIFI_SSID, sizeof(cfg.wifiSsid) - 1);
#else
  strncpy(cfg.wifiSsid, "", sizeof(cfg.wifiSsid) - 1);
#endif

#ifdef WIFI_PASSWORD
  strncpy(cfg.wifiPass, WIFI_PASSWORD, sizeof(cfg.wifiPass) - 1);
#else
  strncpy(cfg.wifiPass, "", sizeof(cfg.wifiPass) - 1);
#endif

#ifdef TANK_ID
  strncpy(cfg.tankId, TANK_ID, sizeof(cfg.tankId) - 1);
#else
  strncpy(cfg.tankId, "tank-01", sizeof(cfg.tankId) - 1);
#endif

#ifdef FIREBASE_HOST
  strncpy(cfg.firebaseHost, FIREBASE_HOST, sizeof(cfg.firebaseHost) - 1);
#else
  strncpy(cfg.firebaseHost, "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com", sizeof(cfg.firebaseHost) - 1);
#endif

#ifdef DEVICE_UID
  strncpy(cfg.deviceUid, DEVICE_UID, sizeof(cfg.deviceUid) - 1);
#else
  snprintf(cfg.deviceUid, sizeof(cfg.deviceUid), "device_esp8266_%06X", ESP.getChipId());
#endif

  cfg.configured = true;
  cfg.checksum = computeChecksum(cfg);
}

} // namespace SmartTank
