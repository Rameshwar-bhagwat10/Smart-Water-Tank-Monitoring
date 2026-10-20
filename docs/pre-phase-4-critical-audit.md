# CRITICAL PRE-PHASE-4 AUDIT REPORT
## Smart Water Tank Monitoring System — Security, Architecture & Integration Verification

**Audit Date**: October 20, 2026  
**Auditor Role**: Senior IoT Security Auditor, Firebase RTDB Security Engineer, Firmware Architect  
**Target Repository**: `Rameshwar-bhagwat10/Smart-Water-Tank-Monitoring`  
**Overall Verdict**: **READY FOR PHASE 4 WITH BLOCKERS**  
**Document Path**: `docs/pre-phase-4-critical-audit.md`

---

## 1. Executive Summary

This critical audit was conducted prior to authorizing Phase 4 embedded firmware implementation. The evaluation examined the complete repository, consisting of the Vite/vanilla JavaScript dashboard, Firebase Security Rules, authentication flows, Node.js test suites, and provisional ESP8266 C++ firmware components.

### Core Strengths Identified
1. **Multi-Tenant Rule Security**: The local `database.rules.json` enforces strict least-privilege role-based access control (RBAC). Unauthenticated users cannot read/write any node. Operators are strictly confined to their assigned tank; cross-tenant reads, writes, and command submissions are firmly rejected.
2. **Dashboard Integrity**: Authentication fails closed. Missing, disabled, or malformed user profiles are denied access. Operator provisioning utilizes a secondary Firebase app instance, ensuring administrator sessions are never invalidated.
3. **Firmware State Machine Logic**: The autonomous C++ hysteresis (20% start / 95% stop), 20-minute maximum runtime timer, and sensor disconnect fail-safe mechanisms are logically sound and enforce safe boot sequences on GPIO pins.

### Critical Blockers & Vulnerabilities Identified
1. **`CMD-001` [CRITICAL / P0] — Stale Command Replay on Edge Reboot**: In `firmware/src/cloud/FirebaseClient.cpp`, the controller polls `/commands` without validating the command timestamp (`requestedAt`) against an NTP clock or storing processed IDs in non-volatile memory. Upon reboot, `_lastProcessedCommandId` is empty, causing the controller to immediately re-execute the last recorded command in Firebase (e.g. historical manual `ON`), turning on the pump unprompted without user presence.
2. **`HW-001` [CRITICAL / P0] — Boot Strapping Pin Conflicts**: In `firmware/src/config/AppConfig.h`, indicators are assigned to `D8` (GPIO15) and `D3` (GPIO0). On the ESP8266, GPIO15 must be pulled LOW and GPIO0 must be pulled HIGH during boot. Wiring LEDs to these pins without precise buffer circuitry will cause the ESP8266 to fail to boot or enter UART flashing mode.
3. **`SEC-001` [CRITICAL / P0] — Device Authentication Architectural Dilemma**: In `FirebaseClient.cpp`, the firmware appends `?auth=<FIREBASE_AUTH_KEY>`. If configured with a legacy Firebase Database Secret, the device bypasses all security rules (granting full database root access). If configured with an API key, Firebase rejects it with HTTP 401. A secure token exchange mechanism (such as device-specific Firebase Auth login) is absent.
4. **`SEC-002` [HIGH / P1] — Unauthenticated Local HTTP Endpoints**: In `firmware/src/server/LocalDashboardServer.cpp`, `/api/command` treats any request with an `@` character as authorized, `/api/login` accepts any password $\ge 6$ characters, and `/api/wifi-setup` has zero authentication, allowing any client on the local network to reflash credentials or cycle the pump relay.
5. **`NET-001` [HIGH / P1] — Mixed-Content Browser Blocking**: An HTTPS deployment of the dashboard (e.g., Firebase Hosting) cannot connect to `http://192.168.4.1/api/live` due to browser Mixed Content and Private Network Access (PNA) restrictions.
6. **`HW-002` & `HW-003` [HIGH / P1] — 5V Sensor Overvoltage on 3.3V NodeMCU**: The ACS712 current sensor ($V_{out} \approx 2.5V - 4.5V$) and 5V flow sensor pulse output exceed the 3.3V/1.0V voltage tolerances of the NodeMCU ADC and GPIO pins without external scaling dividers.

---

## 2. Repository Baseline

### Files Inspected
- **Configuration & Rules**: `database.rules.json`, `firebase.json`, `.firebaserc`, `.gitignore`.
- **Dashboard Source**: `dashboard/src/main.js`, `dashboard/src/firebase/auth.js`, `dashboard/src/firebase/database.js`, `dashboard/src/firebase/config.js`, `dashboard/src/firebase/validation.js`.
- **Firmware Source**: `firmware/src/main.cpp`, `firmware/src/config/AppConfig.h`, `firmware/src/config/ConfigManager.cpp`, `firmware/src/control/PumpController.cpp`, `firmware/src/control/RelayDriver.cpp`, `firmware/src/server/LocalDashboardServer.cpp`, `firmware/src/cloud/FirebaseClient.cpp`, `firmware/src/portal/CaptivePortal.cpp`.
- **Test Suites**: `tests/dashboard-unit.test.js`, `tests/rules-evaluation.test.js`, `tests/pump-controller.test.js`, `tests/sensor-calculations.test.js`.

### Non-Destructive Commands Executed
1. `git status` &rarr; Clean working tree on branch `main` (`commit aaed336`).
2. `node --test tests/dashboard-unit.test.js tests/rules-evaluation.test.js tests/sensor-calculations.test.js tests/pump-controller.test.js` &rarr; **64 tests passed, 0 failed (135.8ms)**.
3. `npm test` (in `dashboard/`) &rarr; **36 tests passed, 0 failed**.
4. `npm run build` (in `dashboard/`) &rarr; **Built successfully in 1.04s** (Vite v6.2.0, zero errors).
5. `pio run` (in `firmware/`) &rarr; **Compiled successfully** (RAM: 41.1%, Flash: 45.1%).

---

## 3. Findings Register

| Finding ID | Severity | Category | Title | Affected File / Function | Blocks Phase 4? |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **`CMD-001`** | **CRITICAL** | Command / Safety | Stale Command Replay on Edge Controller Reboot | `firmware/src/cloud/FirebaseClient.cpp:L166-L170` | **YES** |
| **`HW-001`** | **CRITICAL** | Hardware / Boot | Boot Strapping Pin Conflicts on GPIO15 (D8) & GPIO0 (D3) | `firmware/src/config/AppConfig.h:L17-L18` | **YES** |
| **`SEC-001`** | **CRITICAL** | Security / Auth | Device Authentication Bypass vs 401 Rejection Gap | `firmware/src/cloud/FirebaseClient.cpp:L70-L75` | **YES** |
| **`SEC-002`** | **HIGH** | Local API Security | Trivial Bypass & Unauthenticated Endpoints on Local Server | `firmware/src/server/LocalDashboardServer.cpp:L173, L245` | **YES** |
| **`NET-001`** | **HIGH** | Web Architecture | Mixed-Content Blocking for Local Mode on Hosted HTTPS | `dashboard/src/main.js:L397` | **YES** |
| **`HW-002`** | **HIGH** | Electrical / ADC | ACS712 5V Output Exceeds NodeMCU 3.3V ADC Max Range | `firmware/src/config/AppConfig.h:L40-L44` | **YES** |
| **`HW-003`** | **HIGH** | Electrical / IO | 5V Flow Sensor Pulses Direct to 3.3V GPIO14 Without Divider | `firmware/src/config/AppConfig.h:L12` | **YES** |
| **`HW-004`** | **HIGH** | Electrical / Power | Relay Inductive Kickback & Low-Voltage Power Separation | `firmware/src/control/RelayDriver.cpp` | **YES** |
| **`SEC-003`** | **HIGH** | Local Network | Open (Unencrypted) SoftAP Hotspot Broadcast | `firmware/src/portal/CaptivePortal.cpp:L28` | **NO** |
| **`SEC-004`** | **HIGH** | Secrets Hygiene | Hardcoded Default Admin Password in Provisioning Script | `dashboard/scripts/create-admin-user.js:L10` | **NO** |
| **`SAF-001`** | **MEDIUM** | Pump Safety | Pre-activation High Cutoff Check Missing in `requestManualPump` | `firmware/src/control/PumpController.cpp:L141-L148` | **NO** |
| **`TEST-001`** | **MEDIUM** | Test Fidelity | Rule Evaluation Tests Reimplement Logic in JS Simulation | `tests/rules-evaluation.test.js:L65-L81` | **NO** |
| **`TEST-002`** | **MEDIUM** | Test Fidelity | Pump Controller Tests Exercise JS Class, Not C++ Firmware | `tests/pump-controller.test.js:L27-L45` | **NO** |
| **`PROV-001`** | **MEDIUM** | User Provisioning| Partial Failure Can Leave Orphan Firebase Auth Account | `dashboard/src/firebase/auth.js:L234-L262` | **NO** |
| **`SAF-002`** | **LOW** | Diagnostics | Dry-Run Detection Evaluates Only Flow Rate, Ignoring Current | `firmware/src/control/PumpController.cpp:L97` | **NO** |

---

## 4. Detailed Audit Sections

### Section 4.1: Firebase Rules & Privilege Escalation Assessment (Audits B & C)

#### Local Rules Audit: PASS
- **Admin Privilege Escalation**:
  - Newly authenticated users cannot create `/users/{uid}` with `role: "admin"` because `.write` at `/users/$uid` requires `root.child('users').child(auth.uid).child('role').val() === 'admin'`.
  - Existing operators cannot escalate their role or modify `assignedTankId`.
  - In `dashboard/src/firebase/auth.js:getUserProfile`, unconfigured profiles fail closed with `enabled: false`.
- **Multi-Tenant Isolation**:
  - `/tanks`: Fleet-level read is granted strictly to admins.
  - `/tanks/{tankId}`: Operator access requires `assignedTankId === $tankId`. Operator 1 attempting to query `/tanks/tank-02` receives `PERMISSION_DENIED`.
  - `/tanks/{tankId}/commands`: Validates the exact 5 keys (`requestedMode`, `requestedPumpState`, `commandId`, `requestedAt`, `requestedBy`). Extra keys are rejected via `"$other": { ".validate": false }`. `requestedBy` must strictly equal `auth.uid`. Deletion is prohibited by `newData.exists()`.
  - `/tanks/{tankId}/live`: Operators are prohibited from writing telemetry; only authorized devices in `/deviceRegistry` or admins may write.
- **Deployed Rules Status**: **NOT VERIFIED AGAINST PRODUCTION CONSOLE** (Static inspection performed on local `database.rules.json`; production console was not queried via management API).

---

### Section 4.2: Device Identity & Firebase Authorization (Audit E)

#### Assessment: CRITICAL BLOCKER (`SEC-001`)
- **Current Behavior**: In `firmware/src/cloud/FirebaseClient.cpp:buildUrl`, the firmware appends `?auth=` + `_authKey`.
- **Security Dilemma**:
  1. *Database Secret Mode*: If `_authKey` is a Firebase Database Secret, Google Cloud grants root bypass privileges. The security rules in `database.rules.json` under `/deviceRegistry` and `/live` are completely bypassed. A captured device exposes the entire database.
  2. *Standard API Key Mode*: If `_authKey` is a web API key, Firebase Realtime Database returns HTTP 401 Unauthorized.
  3. *ID Token Mode*: The firmware currently lacks the REST client logic to exchange credentials at `identitytoolkit.googleapis.com` for an ID token and refresh it hourly.
- **Remediation**: Before physical Phase 4 cloud synchronization, implement device-specific authentication (e.g., dedicated device service account, custom token, or device email login with automated hourly token refresh).

---

### Section 4.3: Local HTTP API & Hybrid Connection (Audits F, G & M)

#### Assessment: HIGH SEVERITY BLOCKERS (`SEC-002`, `NET-001`)
- **Local Route Vulnerability**: In `firmware/src/server/LocalDashboardServer.cpp`:
  - `handleApiCommand` authorizes any client that provides an email with `@` or a UID string, or uses hardcoded fallback PIN `"1234"`.
  - `handleApiWifiSetup` accepts POST requests without any authentication, writes to EEPROM, and reboots.
- **Browser Mixed-Content Failure**:
  - When the web dashboard is served from an HTTPS domain (e.g. Firebase Hosting), modern browsers (Chrome, Edge, Safari) block HTTP requests to `http://192.168.4.1/api/live` under Mixed Content and Private Network Access (PNA) security policies.
- **Remediation**:
  1. Add an administrative password / HMAC challenge to `/api/wifi-setup` and `/api/command`.
  2. Enforce that direct local link is used either via the embedded controller dashboard (`http://192.168.4.1`) or document mixed-content exceptions.

---

### Section 4.4: Command Contract & Acknowledgements (Audit H)

#### Assessment: CRITICAL BLOCKER (`CMD-001`)
- **Stale Replay Hazard**: In `firmware/src/cloud/FirebaseClient.cpp:L166-L170`:
  - Deduplication only compares against `_lastProcessedCommandId` stored in RAM.
  - Upon reboot or power glitch, `_lastProcessedCommandId` is reset to `""`.
  - The controller queries `/tanks/{tankId}/commands.json`. If a manual `ON` command is stored in the database, the controller executes it immediately upon boot, energizing the pump without user intent.
- **Remediation**:
  1. On boot, fetch current command and mark its ID as processed without executing.
  2. Implement command TTL verification (reject any command where `currentTimestamp - requestedAt > 60000ms` using NTP).

---

### Section 4.5: Pump Controller Safety Logic (Audit I)

#### Assessment: PASS WITH MINOR FINDINGS (`SAF-001`)
- **Strengths**: Autonomous hysteresis (20% start, 95% stop), 20-minute maximum runtime, dry-run protection, and sensor fault lockout are enforced locally in C++ independent of network connectivity.
- **Safe Boot**: `firmware/src/control/RelayDriver.cpp:L12-L16` latches de-energized pin state before setting `pinMode(OUTPUT)`, preventing relay boot glitches.
- **Defect**: In `PumpController.cpp:requestManualPump`, if the tank is already at 96% and the pump is currently OFF, `requestManualPump` does not check current level before energizing the relay, causing a momentary relay click before `update()` trips `HIGH_LEVEL_CUTOFF` on the next tick.

---

### Section 4.6: Sensor & Electrical Assumptions (Audit J)

#### Assessment: CRITICAL HARDWARE BLOCKERS (`HW-001`, `HW-002`, `HW-003`, `HW-004`)
1. **Boot Strapping Pin Trap**:
   - `PIN_LED_YELLOW` is assigned to `D8` (GPIO15). GPIO15 must be LOW at boot. An LED tied to ground with low resistance or floating can cause boot failure.
   - `PIN_LED_RED` is assigned to `D3` (GPIO0). GPIO0 must be HIGH at boot. If tied to ground through an LED, the chip enters programming mode.
2. **ACS712 Voltage Range**:
   - ACS712 outputs $2.5V \pm (I \times \text{Sensitivity})$. Under AC or high current, peak output reaches $4.5V+$.
   - NodeMCU A0 pin accepts a maximum of **3.3V**. Input voltages above 3.3V will saturate the ADC and risk damaging the internal ADC circuitry.
3. **Flow Sensor Signal Level**:
   - Flow sensor operates at 5V and outputs 5V pulse trains. Connecting directly to GPIO14 risks damaging the 3.3V ESP8266 GPIO. A 1k/2k resistive divider is mandatory.
4. **Inductive Isolation**:
   - Inductive kickback from DC water pumps can reset the NodeMCU. Optocoupled relay isolation and a dedicated pump power supply with flyback diode are required.

---

### Section 4.7: Test Quality & Fidelity (Audit L)

#### Assessment: HIGH SIMULATION FIDELITY, ZERO PHYSICAL EXECUTION
- **Summary**: All 64 tests pass with 100% success rate.
- **Fidelity Breakdown**:
  - `dashboard-unit.test.js` (11 tests): **HIGH FIDELITY** (Tests actual production JS validation modules).
  - `rules-evaluation.test.js` (25 tests): **MEDIUM FIDELITY** (Uses a custom JavaScript AST evaluator simulating RTDB, not the real Java Firebase Emulator).
  - `pump-controller.test.js` (10 tests): **SIMULATION ONLY** (Tests a JavaScript duplicate class `SimulatedPumpController`, not compiled C++ code).
  - `sensor-calculations.test.js` (18 tests): **SIMULATION ONLY** (Tests standalone JS mathematical functions).
  - **Target Hardware / Hardware-in-the-Loop Tests**: **0 tests** (No physical hardware or hardware-in-the-loop test bench was executed).

---

## 5. Prioritized Remediation Plan

### P0 — Must Fix Before Firmware Flashing
1. **Fix `CMD-001`**: In `FirebaseClient.cpp`, discard commands on startup or verify `requestedAt` with NTP.
2. **Fix `HW-001`**: Reassign `PIN_LED_YELLOW` and `PIN_LED_RED` in `AppConfig.h` away from GPIO15 and GPIO0 to safe pins (e.g. GPIO13, GPIO12, or utilize software shift register / single RGB LED).
3. **Fix `SEC-001`**: Establish explicit device authentication model for Firebase REST updates without exposing root database secrets.

### P1 — Must Fix Before Wiring Sensors & Pump
1. **Fix `HW-002` & `HW-003`**: Insert voltage dividers on Flow Sensor (GPIO14) and ACS712 (A0). Update sensor scaling constants in `AppConfig.h`.
2. **Fix `SEC-002`**: Require admin PIN for `/api/wifi-setup` and remove `1234` / `@` authorization bypass in `LocalDashboardServer.cpp`.
3. **Fix `NET-001`**: Clarify that direct local connection requires accessing `http://192.168.4.1` directly in browser when using an HTTPS-hosted cloud portal.

### P2 — Pre-Deployment Hardening
1. **Fix `SEC-003`**: Add default WPA2 passphrase to `CaptivePortal.cpp`.
2. **Fix `SAF-001`**: In `PumpController.cpp`, check current water level before closing relay in `requestManualPump`.
3. **Fix `SEC-004`**: Make admin bootstrap script prompt for password interactively.

---

## 6. Phase 4 Readiness Decision

### Verdict: **READY FOR PHASE 4 WITH BLOCKERS**

#### Safe to Implement Now:
1. Pin re-assignment in `AppConfig.h` to eliminate boot-strapping conflicts (`HW-001`).
2. Command deduplication and startup replay protection in `FirebaseClient.cpp` (`CMD-001`).
3. Local REST API authentication tightening in `LocalDashboardServer.cpp` (`SEC-002`).
4. Physical sensor driver calibration and voltage divider formulas (`HW-002`, `HW-003`).

#### Must Wait for Hardware Circuit Validation:
1. Physical relay connection to high-voltage pump (requires verification of optocoupler isolation, flyback diode, and separate 12V supply).
2. Live sensor calibration wet-runs in physical water tank.

---

## 7. Evidence Appendix

```
Command: git status
Result: On branch main, working tree clean (commit aaed336)

Command: node --test tests/dashboard-unit.test.js tests/rules-evaluation.test.js tests/sensor-calculations.test.js tests/pump-controller.test.js
Result: 64 passed, 0 failed, 8 test suites, duration 135.8ms

Command: npm test (in dashboard/)
Result: 36 passed, 0 failed

Command: npm run build (in dashboard/)
Result: vite build success in 1.04s, dist/assets/index-DhHIiLMy.js (435.88 kB)

Command: pio run (in firmware/)
Result: SUCCESS took 3.25s, RAM: 41.1% (33,692 B), Flash: 45.1% (471,119 B)
```
