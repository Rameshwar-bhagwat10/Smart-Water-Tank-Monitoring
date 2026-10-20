# Phase 4 Configuration, Recovery & Wi-Fi Provisioning Specification
## Smart Water Tank Monitoring System — EEPROM Storage, Captive Portal & Fault Recovery

**Document Reference**: `docs/phase-4/recovery-and-configuration.md`  
**Storage Mechanism**: Non-Volatile EEPROM Emulation (512 Bytes in Flash Sector)  
**Security Fixes Documented**: `SEC-003` (Medium / P2) — SoftAP WPA2 Protection & Sensitive Field Redaction  
**Status**: IMPLEMENTED AND VERIFIED  

---

## 1. Executive Summary

Field IoT devices operating unattended in residential and commercial pump rooms must recover gracefully from power failures, router credential changes, Wi-Fi outages, and cloud disconnects.

The Smart Water Tank Monitoring System firmware implements:
1. **Robust EEPROM Persistence**: Magic-byte validated structure (`MAGIC = 0x544E4B31`).
2. **Secure WPA2 Provisioning Hotspot**: SoftAP protected with WPA2-PSK (`SEC-003: WaterTank2026!`).
3. **Hardware Emergency Recovery Button**: 5-second long press on onboard Flash button (GPIO0) completely wipes EEPROM and restarts into the provisioning portal.
4. **Credential Redaction in Logs**: Zero exposure of Wi-Fi passwords or API keys in serial diagnostics.

---

## 2. Non-Volatile Configuration Data Structure

In `firmware/src/config/ConfigManager.h`:

```cpp
struct DeviceConfig {
  uint32_t magic;         // Validation header: 0x544E4B31 ("TNK1")
  char tankId[32];        // Assigned tank identifier (e.g. "tank-01")
  char deviceUid[64];      // Unique hardware/device identity
  char wifiSsid[32];      // Target home/facility Wi-Fi SSID
  char wifiPass[64];      // Target Wi-Fi WPA2 password
  char firebaseHost[64];  // Custom Firebase database URL
  uint16_t checksum;      // Bitwise checksum for data integrity
};
```

### 2.1 Integrity Verification & Auto-Repair
- Upon boot, `ConfigManager::load()` checks `config.magic == 0x544E4B31`.
- If magic bytes mismatch (first boot or unformatted flash), default values are generated, `isConfigured()` returns false, and the captive portal launches automatically.
- A single temporary network glitch **never** wipes saved configuration.

---

## 3. Wi-Fi SoftAP Provisioning & Captive Portal

When unconfigured or when forced via the flash button:

1. **SoftAP Activation**: Launches WPA2-PSK network:
   - SSID: `SmartTank-Setup` (or `SmartTank-{tankId}`)
   - Password: `WaterTank2026!` (SEC-003: minimum 8 characters)
   - Static IP: `192.168.4.1`
2. **DNS Redirection**: `DNSServer` on UDP port 53 captures all DNS requests (`*`) and resolves them to `192.168.4.1`.
3. **Operating System Detection**: Supports Apple `hotspot-detect.html`, Android `generate_204`, Windows `connecttest.txt`, and Chrome redirect triggers, automatically launching the browser configuration portal.
4. **Credential Submission**:
   - Operator scans networks via `/api/scan-wifi`.
   - Submits credentials via `/api/wifi-setup`.
   - Credentials are saved to EEPROM, and the device restarts into normal hybrid mode.

---

## 4. Hardware Emergency Reset Procedure

If the router is replaced or Wi-Fi credentials change and the device cannot be reached:

```
[Power-On NodeMCU]
       |
[Press & Hold FLASH Button (GPIO0 / D3) for 5 Seconds]
       |
[Piezo Buzzer Emits 500ms Chirp & Red LED Flashes]
       |
[EEPROM Erased & Reset to Defaults]
       |
[Automatic Restart into Setup Captive Portal at 192.168.4.1]
```

---

## 5. Failure Scenarios & Recovery Matrix

| Outage Scenario | Controller Behavior | Recovery Action | Safety Impact |
| :--- | :--- | :--- | :--- |
| **Power Failure / Brownout** | Relay opens immediately (failsafe). | On boot, relay latched OFF. ACS712 zero calibrated. Sensors acquire reading before enabling control. | Safe; no unattended fill. |
| **Home Router Wi-Fi Loss** | SoftAP remains active on 192.168.4.1. Loop continues normal pump safety. | Background task retries Wi-Fi connection every 10s without blocking pump loop. | Autonomous control continues uninterrupted. |
| **Firebase Cloud Outage** | Telemetry PUT times out after 3000ms. Error logged to serial. | Retries on next scheduled 2000ms window. | Zero safety impact; local pump logic independent. |
| **Sensor Cable Disconnected** | Ultrasonic or Flow sensor returns timeout. | Enters `SENSOR_ERROR` or `DRY_RUN` FAULT. Relay de-energized immediately. | Pump stopped; alarm buzzer/LED activated. |
| **Invalid Saved Wi-Fi Pass** | Wi-Fi connection attempts fail. SoftAP remains open. | Operator connects phone to SoftAP `192.168.4.1` and updates credentials via web page. | Zero lockout; local access always available. |

---

## 6. Credential Hygiene & Security

- **Serial Output Redaction**: Password strings are never printed to serial console:
  ```cpp
  Serial.printf("  Target Wi-Fi   : %s (Password: [REDACTED])\n", activeConfig.wifiSsid);
  ```
- **Source Code Hygiene**: Wi-Fi credentials and Firebase private keys are strictly barred from source files. Default placeholders are used until configured via portal.
