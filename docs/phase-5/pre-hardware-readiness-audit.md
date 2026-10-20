# Pre-Hardware Assembly Software Integration Readiness Audit
## Smart Water Tank Monitoring System — Pre-Hardware Assembly Gate

**Document Reference**: `docs/phase-5/pre-hardware-readiness-audit.md`  
**Auditor Role**: Senior IoT Integration Engineer, ESP8266 Firmware Reviewer & Firebase Security Engineer  
**Repository**: `Rameshwar-bhagwat10/Smart-Water-Tank-Monitoring`  
**Audit Scope**: Read-Only Software Integration, Security Contracts, Electrical Assumptions & Hardware Readiness  
**Date**: October 20, 2026  
**Final Readiness Verdict**: **B. READY WITH DOCUMENTED BLOCKERS**  

---

## 1. Executive Summary

This audit evaluates whether the software implementation, firmware drivers, cloud interfaces, and hardware specifications of the **Smart Water Tank Monitoring System** are sufficiently integrated, hardened, and verified to permit physical assembly and subsequent bench testing.

### Key Conclusions:
1. **Mechanical & Unpowered Assembly**: **APPROVED**. The physical pinout, resistor divider bill of materials ($1.0\,\text{k}\Omega / 2.0\,\text{k}\Omega$ for 5V inputs, $10\,\text{k}\Omega / 18\,\text{k}\Omega$ for ACS712 attenuator), and wiring schematics are mathematically sound and consistent across the codebase. Physical mounting, wire harness routing, and passive breadboard/protoboard assembly may proceed immediately.
2. **Firmware Architecture & Safety Interlocks**: **VERIFIED**. The production C++ controller (`PumpController.cpp`) implements an autonomous 7-state state machine (`INITIALIZING`, `IDLE`, `AUTO_FILLING`, `MANUAL_FILLING`, `STOPPING`, `FAULT`, `SENSOR_ERROR`). Pre-activation validation guarantees that manual or remote commands cannot turn the pump ON if water level is $\ge 95\%$, sensor data is invalid/stale, or safety lockouts are active.
3. **Test Count Discrepancy Resolved**: The apparent mismatch between the documented 87 tests and the test runner output of 53 tests has been investigated and resolved with mathematical certainty. In `dashboard-unit.test.js` and `rules-evaluation.test.js`, tests were structured as custom in-file test suites executing 14 and 25 internal test assertions respectively; the Node.js native test runner (`node:test`) counts each file as 1 top-level test script ($1 + 1 + 20 + 20 + 11 = 53$ runner tests, containing 90 individual test assertions).
4. **Documented Blockers Before Applying Power / Energizing Pump**:
   - **Blocker 1 (Electrical)**: Bench metering of 5V sensor divider taps (Echo on D2, Flow pulse on D5, and ACS712 on A0) must be performed with a digital multimeter (DMM) **prior** to seating the NodeMCU into the socket to verify signal amplitudes do not exceed $3.3\,\text{V}$.
   - **Blocker 2 (Cloud Authentication)**: In `FirebaseClient.cpp`, REST requests authenticate using `?auth=_authKey`. If a Firebase Auth ID Token is used, Firebase ID tokens expire after 3600 seconds (1 hour) and no HTTP token refresh loop is implemented. If a legacy Database Secret is used, Firebase rules are bypassed as admin. A long-lived custom token or refresh handler must be configured for sustained cloud operations.
   - **Blocker 3 (Electrical Isolation)**: The pump motor high-current circuit must **never** be routed through a solderless breadboard. High inrush motor currents must connect directly to relay screw terminals with flyback diode protection.

---

## 2. Repository Baseline

### 2.1 Git Working Tree & Branch Status
- **Current Branch**: `main`
- **Head Commit**: `3165ea7` (`feat(phase-4a): implement critical bug fixes, security hardening, and firmware safety`)
- **Working Tree State**:
  - Phase 4 C++ firmware enhancements implemented and compiled.
  - Phase 4 documentation deliverables generated under `docs/phase-4/`.
  - Zero destructive Git operations performed.

### 2.2 Phase 4A Critical Remediation Verification
All 11 audit remediations established during Phase 4A remain present and intact in the working tree:
- `CMD-001` (Stale Command Replay): Baseline establishment, deduplication, and 60s TTL enforced in `FirebaseClient.cpp`.
- `HW-001` (Boot Glitch Relay & LED): Relay initialized safe HIGH before `pinMode(OUTPUT)` in `RelayDriver.cpp`; Red LED moved to boot-safe D4 (active-LOW).
- `SEC-001` (Firebase Least Privilege): Admin-only user directory access and multi-tenant `$tankId` scoping active in `database.rules.json`.
- `SEC-002` (Local HTTP Hardening): 15-minute cryptographically random session tokens and 30-second lockout after 5 failed attempts active in `LocalDashboardServer.cpp`.
- `HW-002` & `HW-003` (Sensor Overvoltage): $1.0\,\text{k}\Omega / 2.0\,\text{k}\Omega$ and $10.0\,\text{k}\Omega / 18.0\,\text{k}\Omega$ conditioning circuits active in code.
- `SEC-003` (SoftAP Hotspot WPA2): Protected by WPA2-PSK (`WaterTank2026!`).
- `SAF-001` (Pre-Activation Safety): Hard cutoff at 95% enforced prior to relay actuation in `PumpController.cpp`.

---

## 3. Verified Test Counts & Discrepancy Resolution

### 3.1 The Audit Question
The Phase 4 report listed individual suite counts totaling 87 tests:
- Dashboard unit tests: 14
- Pump controller tests: 18 (expanded to 20 during 7-state implementation)
- Firebase rules evaluation tests: 25
- Sensor calculation tests: 19 (expanded to 20 during attenuator implementation)
- Phase 4A regression tests: 11
However, the test runner reported: `ℹ tests 53 | ℹ suites 14 | ℹ pass 53`.

### 3.2 Source Investigation & Verified Anatomy
Running each test file individually with `node --test` revealed the exact structural reason for the count difference:

```
+------------------------------------+------------------+---------------------+-------------------------------+
| Test File                          | Runner Tests (N) | Internal Assertions | Runner Implementation Method  |
+------------------------------------+------------------+---------------------+-------------------------------+
| tests/dashboard-unit.test.js       |        1         |         14          | Custom in-file test loop      |
| tests/rules-evaluation.test.js     |        1         |         25          | Custom AST rule evaluator     |
| tests/pump-controller.test.js      |       20         |         20          | node:test (describe/it)       |
| tests/sensor-calculations.test.js  |       20         |         20          | node:test (describe/it)       |
| tests/phase-4a-regression.test.js  |       11         |         11          | node:test (describe/it)       |
+------------------------------------+------------------+---------------------+-------------------------------+
| TOTALS                             |       53         |         90          | 100% Pass Rate (0 Failures)   |
+------------------------------------+------------------+---------------------+-------------------------------+
```

1. **`dashboard-unit.test.js`**: Defines its own synchronous `it(description, fn)` function that executes 14 assertions and logs `Results: 14 passed, 0 failed.` It does not import `{ it } from 'node:test'`. When executed under `node --test`, Node.js registers the entire file execution as **1 top-level test script**.
2. **`rules-evaluation.test.js`**: Similarly defines its own synchronous `it()` harness that evaluates 25 rule assertions, logging `Results: 25 passed, 0 failed.` Node.js registers the file execution as **1 top-level test script**.
3. **`pump-controller.test.js`**, **`sensor-calculations.test.js`**, and **`phase-4a-regression.test.js`**: Import `{ describe, it } from 'node:test'` and register 20, 20, and 11 distinct subtests across 14 suites ($20 + 20 + 11 = 51$).
4. **Calculation**: $1 + 1 + 20 + 20 + 11 = \mathbf{53}$ tests reported by the Node runner, verifying **90 discrete test conditions**.

---

## 4. Firmware Integration Findings

| Check Item | Implementation Evidence | Verification Status |
| :--- | :--- | :---: |
| **Build Integrity** | All modules compile under PlatformIO (`nodemcuv2`). RAM: 42.5%, Flash: 45.6%. | **VERIFIED** |
| **Main Loop Integration** | `main.cpp` calls `ultrasonic.measure()`, `flowSensor.update()`, and `currentSensor.measureRmsCurrent()` every 200ms. | **VERIFIED** |
| **Controller Data Flow** | Measured level, valid flag, flow rate, current, and freshness feed directly into `pumpController.update()`. | **VERIFIED** |
| **Sensor Fault Handling** | Stale readings ($>5000\,\text{ms}$) or transducer errors immediately trip `SENSOR_ERROR` and de-energize the relay. | **VERIFIED** |
| **Relay Exclusivity** | `RelayDriver` is the sole module with physical access to GPIO12. No other module writes to GPIO12. | **VERIFIED** |
| **Unified Command Path**| Remote cloud commands and local web commands enter the identical `requestManualPump()` safety validation. | **VERIFIED** |
| **Hysteresis & Safety** | 20% auto-fill ON, 95% auto-stop OFF, 95% hard cutoff in all modes, 20-min max runtime, 15s dry-run trip. | **VERIFIED** |
| **Watchdog Hygiene** | Loop is strictly non-blocking; `yield()` feeds hardware and software watchdogs on every pass. | **VERIFIED** |
| **Disabled Sensors** | `LeakageSensor.h` is explicitly disabled (`isEnabled() == false`) and reports `"DISABLED_NOT_INSTALLED"`. | **VERIFIED** |

---

## 5. Firebase Integration Findings

### 5.1 Telemetry Contract Consistency
The schema in `FirebaseClient.cpp::publishTelemetry()`:
- `levelPercent` (serialized number)
- `distanceCm` (serialized number)
- `flowRateLpm` (serialized number)
- `totalLitres` (serialized number)
- `pumpCurrentA` (serialized number)
- `pumpState` (`"ON"` | `"OFF"`)
- `controlMode` (`"AUTO"` | `"MANUAL"`)
- `controllerStatus` (`"INITIALIZING"`, `"IDLE"`, `"AUTO_FILLING"`, `"MANUAL_FILLING"`, `"STOPPING"`, `"FAULT"`, `"SENSOR_ERROR"`)
- `sensorStatus` (`"OK"`, `"DEGRADED"`, `"ERROR"`)
- `faultCode` (`"NONE"`, `"HIGH_LEVEL_CUTOFF"`, `"MAX_RUNTIME_EXCEEDED"`, `"DRY_RUN_DETECTED"`, `"SENSOR_FAULT"`)
- `wifiConnected` (`true`)
- `updatedAt` (epoch milliseconds)

**Verification**: This payload strictly satisfies `database.rules.json` (`newData.hasChildren(['levelPercent', 'pumpState', 'updatedAt'])`) and `dashboard/src/firebase/validation.js::validateLiveTelemetry()`.

### 5.2 Command Contract & Replay Protection
- **Path**: `/tanks/{tankId}/commands`
- **Fields**: `commandId`, `requestedMode`, `requestedPumpState`, `requestedAt`, `requestedBy`.
- **Validation**: Strict schema validation rejecting unexpected keys (`$other: false`).
- **Replay Protection**:
  1. Boot baseline establishment: Historical commands existing at boot are recorded without actuation.
  2. Deduplication: Repeated polls across cycles ignore identical command IDs.
  3. TTL window: Commands older than 60,000 ms rejected via NTP-synchronized time.
- **Acknowledgements**: Written to `/tanks/{tankId}/commandAcks/{commandId}` with statuses `RECEIVED`, `APPLIED`, `REJECTED`, or `FAILED`.

### 5.3 Critical Authentication Finding (`BLOCKER 2`)
- **Affected File**: `firmware/src/cloud/FirebaseClient.cpp::buildUrl()`
- **Observation**: `url += "?auth=" + _authKey;`
- **Analysis**:
  - If `_authKey` is a **Firebase Auth ID Token**, Firebase ID tokens expire after **1 hour** (3600 seconds). The firmware has no HTTP refresh mechanism to exchange a refresh token via Google Identity Toolkit REST API (`identitytoolkit.googleapis.com`). Unattended devices will fail with HTTP 401 after 60 minutes.
  - If `_authKey` is a **Firebase Database Secret**, the secret bypasses all security rules in `database.rules.json` (grants unconditional root admin).
- **Remediation Required Before Long-Term Field Deployment**: Implement an automated token refresh loop in firmware or use long-lived service credentials with Firebase Auth REST endpoints.

---

## 6. Dashboard / Local API Integration Findings

### 6.1 Route Table Consistency

| Endpoint Path | Method | Firmware Handler | Dashboard Consumer | Match Status |
| :--- | :---: | :--- | :--- | :---: |
| `/` | `GET` | `handleRoot()` | Browser navigation (Embedded Local Dashboard) | **MATCH** |
| `/api/live` | `GET` | `handleApiLive()` | Probed by `main.js::350`, `main.js::406`, `main.js::1734` | **MATCH** |
| `/api/login` | `POST` | `handleApiLogin()` | Embedded dashboard login & session issuance | **MATCH** |
| `/api/command` | `POST` | `handleApiCommand()` | Dispatched by `main.js::2048` (`dispatchCommand`) | **MATCH** |
| `/api/wifi-setup`| `POST` | `handleApiWifiSetup()`| Pushed by `main.js::1850` and `main.js::1922` | **MATCH** |
| `/api/scan-wifi` | `GET` | `handleApiScanWifi()` | Pushed by `main.js::1761` (`btn-prov-scan`) | **MATCH** |

### 6.2 Browser Mixed Content Limitation
- When the cloud dashboard is loaded over an `https://` domain (e.g. Firebase Hosting `https://smart-water-tank.web.app`), modern web browsers enforce strict mixed-content security policies and block HTTP requests to `http://192.168.4.1`.
- The dashboard in `dashboard/src/main.js` correctly detects this condition (`window.location.protocol === 'https:'`) and provides a clear explanatory banner advising the operator to open `http://192.168.4.1` directly in a new tab.

---

## 7. Security and Failure Handling Findings

1. **Local API Rate Limiting**: `LocalDashboardServer.cpp` increments `_failedAuthAttempts` upon incorrect operator PIN. After 5 consecutive failures, a 30-second lockout is engaged (`HTTP 429`), preventing brute-force attacks.
2. **Wi-Fi Provisioning Authorization**: Sensitive endpoint `/api/wifi-setup` requires valid operator credentials or session token. Unauthenticated credential overwrite is blocked.
3. **Multi-Tenant Tank Isolation**: Database rules strictly isolate operator and device access to their designated `$tankId`. Cross-tank reads or writes are rejected.
4. **Boot Safe Relay Output**: `RelayDriver::begin()` drives GPIO12 to HIGH (safe OFF) prior to configuring pin mode to `OUTPUT`, preventing startup relay chatter during microcontroller reboot.
5. **Secret Hygiene**: Zero passwords or authentication tokens are printed to serial console; `secrets.h` is barred from Git via `.gitignore`.

---

## 8. Hardware-Assembly Prerequisites & Electrical Safety

```
================================================================================
ELECTRICAL VALIDATION GATES (MUST BE COMPLETED BEFORE APPLYING POWER)
================================================================================
```

### 8.1 Gate 1: Unpowered Mechanical Assembly (`PERMITTED`)
- Mount ESP8266 NodeMCU on protoboard or terminal adapter.
- Install 1/4W 1% metal film resistors for signal conditioning:
  - $R_1 = 1.0\,\text{k}\Omega$, $R_2 = 2.0\,\text{k}\Omega$ for HC-SR04 Echo divider to D2 (`GPIO4`).
  - $R_3 = 1.0\,\text{k}\Omega$, $R_4 = 2.0\,\text{k}\Omega$ for Flow sensor pulse divider to D5 (`GPIO14`).
  - $R_5 = 10.0\,\text{k}\Omega$, $R_6 = 18.0\,\text{k}\Omega$ for ACS712 attenuator to A0 (`ADC0`).
  - Current-limiting resistors for LEDs: $330\,\Omega$ for Green (D0) and Red (D4), $470\,\Omega$ for Yellow (D8).

### 8.2 Gate 2: Bench Metering Verification (`MANDATORY BEFORE CONNECTING NODEMCU`)
- [ ] **Power Supply**: Apply 5V to the power rail without NodeMCU installed. Verify DMM reads between $4.90\,\text{V}$ and $5.15\,\text{V}$.
- [ ] **Ultrasonic Echo Divider**: Power HC-SR04 with 5V. Trigger with test pulse. Confirm voltage at center tap to D2 never exceeds $3.40\,\text{V}$.
- [ ] **Flow Sensor Pulse Divider**: Power ZJ-S201 with 5V. Rotate turbine. Confirm square wave voltage at center tap to D5 switches cleanly between $0.0\,\text{V}$ and $3.33\,\text{V}$.
- [ ] **ACS712 Attenuator**: Power ACS712 with 5V. With zero current load, verify voltage at center tap to A0 measures $1.60\,\text{V} \pm 0.05\,\text{V}$.

### 8.3 Gate 3: Relay & High-Current Wiring Safety
- [ ] **Flyback Diode**: Confirm opto-isolated relay module contains onboard freewheeling diode across the coil.
- [ ] **Breadboard Restriction**: Solderless breadboard tracks must **never** carry DC pump motor current. Wire 12V power supply, relay NO contact, pump motor, and ground return using $\ge 18\,\text{AWG}$ stranded copper wire.
- [ ] **Star Ground**: Connect 5V logic ground, 12V pump power ground, and NodeMCU GND at a single star-ground terminal to prevent inductive motor noise from resetting the microcontroller.

---

## 9. Discrepancies Between Source Code & Documentation

1. **Red LED Pin Mapping**:
   - In `docs/pin-mapping.md` (Line 20): Red LED is provisionally listed as `TX (D9) / GPIO1` or `GPIO3`.
   - In `firmware/src/config/AppConfig.h` (Line 18): Red LED is explicitly mapped to `PIN_LED_RED = 2` (D4 / GPIO2, active-LOW boot-safe pull-up).
   - *Status*: Code is correct (`HW-001` fix). `docs/pin-mapping.md` contains historical provisional text that should be updated.
2. **ACS712 Conditioning Circuit**:
   - In `docs/pin-mapping.md` (Line 64): Recommends that ACS712 voltage span "must be validated during physical hardware calibration."
   - In `docs/hardware/sensor-electrical-design.md` and `firmware/src/sensors/CurrentSensor.cpp`: Specifically designed and implemented with $10\,\text{k}\Omega / 18\,\text{k}\Omega$ attenuator ($K_{div} = 0.642857$).
   - *Status*: Resolved in firmware and electrical design spec; pin-mapping document is superseded by `sensor-electrical-design.md`.
3. **Live Telemetry Schema Extension**:
   - `firmware/src/cloud/FirebaseClient.cpp` includes `controllerStatus` and `faultCode` in `/live` telemetry.
   - `dashboard/src/firebase/validation.js` validates core fields (`levelPercent`, `distanceCm`, etc.) but does not yet explicitly forward `controllerStatus` and `faultCode` into the sanitized object returned by `validateLiveTelemetry()`.
   - *Status*: Non-breaking. Firebase rules permit the fields, and raw snapshot retains them.

---

## 10. Remaining Software Defects & Deficiencies

| Defect ID | Severity | File & Component | Description | Remediation |
| :--- | :---: | :--- | :--- | :--- |
| **DEF-001** | Medium / P2 | `firmware/src/cloud/FirebaseClient.cpp` | Absence of OAuth token refresh loop for Firebase Auth ID tokens. Tokens expire after 60 minutes. | Add token refresh HTTP POST to Google Identity Toolkit REST endpoint. |
| **DEF-002** | Low / P3 | `dashboard/src/firebase/validation.js` | `validateLiveTelemetry()` drops `controllerStatus` and `faultCode` from sanitized output. | Add `controllerStatus` and `faultCode` to whitelist in `validation.js`. |
| **DEF-003** | Low / P3 | `docs/pin-mapping.md` | Contains provisional mapping of Red LED to TX/GPIO1 instead of D4/GPIO2. | Update `docs/pin-mapping.md` to reflect `AppConfig.h`. |

---

## 11. Hardware Tests That Must Be Performed Manually

1. **Power-On Reset Glitch Check**: Monitor GPIO12 (D6) on an oscilloscope during power application to verify relay coil voltage remains 0V without any active-LOW drop.
2. **Quiescent Current Sensor Zero**: Measure A0 voltage with DMM when pump is unpowered; verify voltage is $1.60\,\text{V} \pm 0.05\,\text{V}$.
3. **Acoustic Transducer Deadband**: Position target at $1.5\,\text{cm}$ and verify driver reports out-of-bounds/deadband status.
4. **Wet Bucket Flow Calibration**: Run pump to fill a calibrated 10.0L container; record pulse count and verify calibration factor ($K \approx 450\,\text{pulses/L}$).
5. **Dry-Run Induction Trip**: Close suction valve while pump is energized; verify controller trips `DRY_RUN_DETECTED` within 20 seconds.

---

## 12. Exact Commands Executed & Actual Results

### Test Command 1: Full Test Suite
```bash
node --test tests/*.test.js
```
**Actual Result**:
- Tests: **53 passing**, 0 failing.
- Suites: **14 passing**, 0 failing.
- Duration: **243.12 ms**.
- Exit Code: **0**.

### Test Command 2: Firmware Compilation
```bash
cd firmware && pio run && cd ..
```
**Actual Result**:
- Environment: `nodemcuv2` (Espressif 8266, Arduino framework).
- RAM Usage: **34,808 bytes (42.5%)**.
- Flash Usage: **475,951 bytes (45.6%)**.
- Duration: **15.87 seconds**.
- Exit Code: **0**.

### Test Command 3: Web Dashboard Build
```bash
cd dashboard && npm run build && cd ..
```
**Actual Result**:
- Bundler: Vite v6.4.4.
- Modules Transformed: **21**.
- Bundle Size: `dist/assets/index-BVam7Aow.js` (440.09 kB).
- Duration: **947 ms**.
- Exit Code: **0**.

---

## 13. Final Verdict & Readiness Decision

```
================================================================================
FINAL VERDICT:
B. READY WITH DOCUMENTED BLOCKERS
================================================================================
```

### Authorization Scope:
1. **Unpowered Mechanical & Electrical Assembly**: **AUTHORIZED**. Mounting components, wiring resistor dividers, assembling status LEDs, and preparing wire harnesses may proceed immediately.
2. **Powered Circuit Verification**: **CONDITIONALLY AUTHORIZED**. Permitted only after bench metering verifies that signal voltages on D2, D5, and A0 do not exceed $3.3\,\text{V}$.
3. **Live Pump Operation**: **BLOCKED** until bench metering and low-voltage lamp load tests are successfully completed.
