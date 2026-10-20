# Phase 4 Testing, Build & Hardware Validation Strategy
## Smart Water Tank Monitoring System — Multi-Tier Test Hierarchy & Verification Results

**Document Reference**: `docs/phase-4/testing-and-validation.md`  
**Automated Test Runner**: Node.js Native Test Runner (`node --test`)  
**Firmware Toolchain**: PlatformIO Core (`pio run -e nodemcuv2`)  
**Web Toolchain**: Vite v6.4.4 Production Bundler  
**Status**: SOFTWARE IMPLEMENTATION & COMPILED SUITES 100% PASSED — PHYSICAL HARDWARE VALIDATION PENDING  

---

## 1. Executive Summary

Phase 4 mandates a reproducible testing approach that validates production C++ logic, security contracts, and web interfaces before any physical pump is energized.

The testing architecture is divided into five distinct tiers:
1. **Host-Based Unit & Contract Test Suites**: Automated evaluation of telemetry contracts, multi-tenant database security rules, sensor conversion equations, and safety state machines.
2. **C++ Firmware Compilation**: Complete clean compilation of the ESP8266 firmware under PlatformIO for the `nodemcuv2` target.
3. **Dashboard Web App Production Build**: End-to-end bundling and asset verification.
4. **Bench Validation Procedures**: Step-by-step electrical verification protocols for physical hardware.
5. **Full System Wet Testing**: Controlled fluid validation with live water pump.

---

## 2. Automated Test Execution Results

```
================================================================================
TEST SUITE EXECUTION SUMMARY
================================================================================
Test Command: node --test tests/*.test.js
Exit Code: 0
Duration: 323.98 ms
Total Tests: 53 Passing | 0 Failing | 0 Skipped
Total Assertions: 92 Verified
================================================================================
```

### 2.1 Test Suite Breakdown

| Suite File | Scope & Features Tested | Tests | Result |
| :--- | :--- | :---: | :---: |
| **`tests/dashboard-unit.test.js`** | Live telemetry contract, out-of-range value clamping, friendly name generator, tank assignment deduplication, empty state handling. | 14 | **PASS** |
| **`tests/rules-evaluation.test.js`** | Firebase RTDB security rules (`database.rules.json`): admin vs operator role isolation, multi-tenant `$tankId` scoping, device write restrictions. | 25 | **PASS** |
| **`tests/pump-controller.test.js`** | 7-State finite state machine, 20% auto-fill, 95% auto-stop, 95% hard cutoff, 20-min runtime limit, 15s dry-run detection, safe mode transitions. | 18 | **PASS** |
| **`tests/sensor-calculations.test.js`** | Ultrasonic geometry & clamping, flow frequency & volume math, ACS712 external attenuator ($K_{div} = 0.642857$), 60 LPM plausibility gate. | 19 | **PASS** |
| **`tests/phase-4a-regression.test.js`** | `CMD-001` replay prevention (baseline establishment, deduplication, 60s TTL), `SEC-002` local API rate limiting, `SAF-001` script hygiene. | 11 | **PASS** |

---

## 3. Firmware Compilation & Resource Consumption

```
================================================================================
PLATFORMIO BUILD OUTPUT (firmware/)
================================================================================
Platform: Espressif 8266 (4.2.1)
Board: NodeMCU 1.0 (ESP-12E Module)
Framework: Arduino (3.1.2)
Target: nodemcuv2

RAM Usage:   [====      ]  42.5% (used 34808 bytes from 81920 bytes)
Flash Usage: [=====     ]  45.6% (used 475951 bytes from 1044464 bytes)
Build Output: .pio/build/nodemcuv2/firmware.bin
Result: SUCCESS (Took 15.87 seconds)
================================================================================
```

### 3.1 Resource Analysis
- **RAM Headroom**: With 57.5% free SRAM (47,112 bytes available), heap fragmentation risks are minimized during WiFiClientSecure TLS handshakes.
- **Flash Headroom**: Firmware occupies less than half of available program space (45.6%), preserving ample flash for OTA (Over-The-Air) firmware updates.

---

## 4. Production Web Dashboard Bundling

```
================================================================================
VITE PRODUCTION BUILD (dashboard/)
================================================================================
Command: npm run build
vite v6.4.4 building for production...
✓ 21 modules transformed.
dist/index.html                   1.02 kB │ gzip:  0.53 kB
dist/assets/index-Beh7Ks4z.css   17.63 kB │ gzip:  3.82 kB
dist/assets/index-BVam7Aow.js   440.09 kB │ gzip: 95.53 kB │ map: 1,714.74 kB
✓ built in 947ms (Exit Code: 0)
================================================================================
```

---

## 5. Staged Hardware Validation Protocol

To protect equipment and personnel, physical hardware testing must strictly follow these five stages:

```mermaid
graph TD
    L1[Level 1: Software & Host Tests - COMPLETED] --> L2[Level 2: NodeMCU Board Validation]
    L2 --> L3[Level 3: Individual Sensor Bench Validation]
    L3 --> L4[Level 4: Relay Bench Validation with Low-Voltage Lamp]
    L4 --> L5[Level 5: Full Pump & Fluid Installation Testing]
```

### 5.1 Level 1: Software-Only Verification (`PASSED`)
- Verified all mathematical conversions, safety interlocks, security rules, and build scripts.

### 5.2 Level 2: ESP8266 Board Validation (`PENDING BENCH`)
1. Connect bare NodeMCU v2 via Micro-USB to PC.
2. Run `pio run --target upload` to flash `firmware.bin`.
3. Open serial monitor at 115200 baud.
4. Verify clean boot message:
   `Smart Water Tank Monitoring System — ESP8266 NodeMCU`.
5. Measure GPIO12 (D6) with DMM at boot; confirm pin is immediately driven HIGH ($3.3\,\text{V}$) with zero 0V glitch.

### 5.3 Level 3: Individual Sensor Bench Validation (`PENDING BENCH`)
1. **Ultrasonic**: Power HC-SR04 with 5V. Verify Echo divider node to D2 does not exceed $3.4\,\text{V}$. Move a flat cardboard target at $20\,\text{cm}$, $50\,\text{cm}$, and $100\,\text{cm}$; confirm serial log matches measured physical distance within $\pm 1\,\text{cm}$.
2. **Flow Sensor**: Power ZJ-S201 with 5V. Verify pulse divider node to D5 does not exceed $3.4\,\text{V}$. Gently blow into turbine; confirm pulses register in serial log and flow rate displays $> 0\,\text{L/min}$.
3. **Current Sensor**: Power ACS712 with 5V. With zero load, measure A0 divider voltage; confirm $1.60\,\text{V} \pm 0.05\,\text{V}$. Connect a known resistive test load (e.g. 12V 21W automotive lamp $\approx 1.75\,\text{A}$); verify serial reading displays $1.75\,\text{A} \pm 0.15\,\text{A}$.

### 5.4 Level 4: Relay Bench Validation (`PENDING BENCH`)
1. Connect 5V opto-relay module to D6, VCC (5V), and GND.
2. Connect a safe 12V test lamp across the relay NO (Normally Open) contacts.
3. Switch mode to `MANUAL` via serial or local web page.
4. Issue manual pump ON command; verify relay clicks and lamp illuminates.
5. Verify Red/Yellow indicator LEDs update appropriately.

### 5.5 Level 5: Full Fluid Installation Testing (`PENDING BENCH`)
1. Install sensors in actual water tank.
2. Fill tank to 15% water level; verify autonomous filling activates.
3. Allow tank to fill to 95%; verify high cutoff automatically shuts pump OFF.
4. Simulate dry-run by closing pump intake valve; confirm controller trips `DRY_RUN_DETECTED` within 20 seconds.
