# Quality Assurance & Testing Plan
## Smart Water Tank Monitoring System — Verification Matrix

---

## 1. Readiness Classification

To establish clear operational boundaries, all test suites are categorized by their execution feasibility:

- **TIER 1 [CURRENT / EXECUTABLE NOW]**: Tests validated during Phase 1 that run locally on software build tools without cloud or hardware dependencies.
- **TIER 2 [PHASE 2 & 3 / CLOUD DEPENDENT]**: Tests requiring configured Firebase Realtime Database rules, authentication tokens, or web clients.
- **TIER 3 [PHASE 4 / SIMULATION DEPENDENT]**: Algorithmic unit and state transition tests executed in simulation harnesses or unit test runners.
- **TIER 4 [PHASE 5 & 6 / HARDWARE & SMS DEPENDENT]**: Physical hardware-in-the-loop tests requiring calibrated tanks, transducers, motor wiring, and external SMS carrier gateways.

---

## 2. Test Suite Specifications

### Test Suite 1: Development Environment Verification
- **Classification**: **TIER 1 (Current / Executable Now)**
- **Objective**: Verify availability, compatibility, and versions of foundational toolchains.
- **Procedure**:
  ```powershell
  node -v
  npm -v
  git --version
  code -v
  ```
- **Expected Outcome**: Node.js $\ge 18$ LTS, npm $\ge 9$, Git $\ge 2.30$, and VS Code operational.
- **Status in Phase 1**: **PASS** (Node v24.12.0, npm 11.6.0, git 2.50.0).

---

### Test Suite 2: Dashboard Local Development Server Startup
- **Classification**: **TIER 1 (Current / Executable Now)**
- **Objective**: Ensure the Vite development server launches without compilation errors and serves the application over local HTTP.
- **Procedure**:
  ```powershell
  cd dashboard
  npx vite --port 5173
  Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing
  ```
- **Expected Outcome**: HTTP status code `200 OK`, response body contains HTML scaffolding, modern CSS loads, and console displays initialization confirmation.
- **Status in Phase 1**: **PASS** (Verified with HTTP 200 response).

---

### Test Suite 3: Dashboard Production Bundle Build
- **Classification**: **TIER 1 (Current / Executable Now)**
- **Objective**: Validate static compilation, asset minification, and bundling via Vite.
- **Procedure**:
  ```powershell
  cd dashboard
  npm run build
  Test-Path "dist/index.html", "dist/assets/*.css", "dist/assets/*.js"
  ```
- **Expected Outcome**: Clean build in `< 1.0 s` with zero syntax warnings or unresolved imports. Artifacts generated in `dist/`.
- **Status in Phase 1**: **PASS** (Built in 114ms, valid `dist/` directory).

---

### Test Suite 4: Water Level Calculation & Filtering Algorithms
- **Classification**: **TIER 3 (Phase 4 / Simulation)**
- **Objective**: Validate the algorithmic transformation of raw ultrasonic flight time ($\mu\text{s}$) into calibrated volume percentage.
- **Formula**:
  $$\text{distanceCm} = \frac{\text{flightTimeMicroseconds}}{2 \times 29.1}$$
  $$\text{levelPercent} = \frac{\text{TankHeight} - \text{distanceCm}}{\text{TankHeight} - \text{DeadBand}} \times 100\%$$
- **Test Cases**:
  1. *Normal mid-level*: Sensor reads $50\,\text{cm}$ in a $100\,\text{cm}$ tank $\rightarrow 50.0\%$.
  2. *Top deadband clamp*: Sensor reads $5\,\text{cm}$ (closer than minimum transducer range $10\,\text{cm}$) $\rightarrow$ clamp to $100.0\%$ with diagnostic warning.
  3. *Empty tank*: Sensor reads $100\,\text{cm} \rightarrow 0.0\%$.
  4. *Spurious reflection spike*: Injected sequence $[50, 51, 999, 50, 49]$ filtered via moving median filter $\rightarrow$ resultant $50\,\text{cm}$ (spike rejected).
- **Prerequisite**: Implementation of `WaterLevelCalculation` module in C++.

---

### Test Suite 5: Flow Calculation & Pulse Calibration Tests
- **Classification**: **TIER 3 (Phase 4 / Simulation)**
- **Objective**: Verify pulse accumulation math against the ZJ-S201 transfer function ($Q = f / 4.8$).
- **Test Cases**:
  1. *Frequency mapping*: Injected $48\,\text{Hz}$ square wave over $1000\,\text{ms} \rightarrow 10.0\,\text{L/min}$.
  2. *Integration*: Running at $10.0\,\text{L/min}$ for 60 seconds accumulates $10.0\,\text{Litres}$ into `totalLitres`.
  3. *Zero flow*: No pulses received over $2000\,\text{ms} \rightarrow 0.0\,\text{L/min}$.
- **Prerequisite**: Timer/Interrupt ISR test harness in Phase 4.

---

### Test Suite 6: Current Sensor Calibration & Zero-Drift Tests
- **Classification**: **TIER 3 (Phase 4 / Simulation)**
- **Objective**: Validate ACS712 zero-current offset calibration and RMS calculation.
- **Test Cases**:
  1. *Quiescent baseline*: Input voltage steady at $2.50\,\text{V} \rightarrow 0.00\,\text{A} \pm 0.05\,\text{A}$.
  2. *Inrush current spike*: Transient $6\,\text{A}$ spike for $150\,\text{ms}$ during motor start does not trigger premature stall fault.
  3. *Dry-run detection*: Current drops below $0.5\,\text{A}$ while pump is commanded ON $\rightarrow$ flags dry-run warning.
  4. *Motor stall*: Current exceeds $4.5\,\text{A}$ continuously for $> 2.0\,\text{s} \rightarrow$ triggers emergency overcurrent trip.
- **Prerequisite**: ADC simulation test vector in Phase 4.

---

### Test Suite 7: Pump Operational State Transitions
- **Classification**: **TIER 3 (Phase 4 / Simulation)**
- **Objective**: Validate hysteresis state machine in `AUTO` and `MANUAL` modes.
- **State Transition Matrix**:
  | Current State | Mode | Trigger Condition | Expected Next State | Actuator Signal |
  | :--- | :--- | :--- | :--- | :--- |
  | `PUMP_OFF` | `AUTO` | `levelPercent <= 20%` | `PUMP_ON` | Relay energized (D6 HIGH) |
  | `PUMP_ON` | `AUTO` | `levelPercent >= 90%` | `PUMP_OFF` | Relay de-energized (D6 LOW) |
  | `PUMP_ON` | `AUTO` | `20% < levelPercent < 90%` | `PUMP_ON` | Hysteresis maintained (Relay remains HIGH) |
  | `PUMP_OFF` | `AUTO` | `20% < levelPercent < 90%` | `PUMP_OFF` | Hysteresis maintained (Relay remains LOW) |
  | `PUMP_OFF` | `MANUAL` | User command: `requestedPumpState: "ON"` | `PUMP_ON` | Relay energized |
  | `PUMP_ON` | `MANUAL` | User command: `requestedPumpState: "OFF"` | `PUMP_OFF` | Relay de-energized |
  | ANY | ANY | `levelPercent >= 95%` | `PUMP_OFF` | **Emergency Cutoff (Forced)** |
  | ANY | ANY | Continuous runtime $> 20\,\text{min}$ | `FAULT_TIMEOUT` | **Timeout Cutoff (Forced)** |
- **Prerequisite**: Embedded state engine implementation in Phase 4.

---

### Test Suite 8: Invalid Sensor & Timeout Handling Tests
- **Classification**: **TIER 3 (Phase 4 / Simulation)**
- **Objective**: Ensure the system fails safe when transducers disconnect or produce impossible values.
- **Test Cases**:
  1. *Ultrasonic open circuit*: Echo pin never transitions HIGH $\rightarrow$ timeout detected after $38\,\text{ms} \rightarrow$ pump forced OFF, red LED active, buzzer alarm sounding.
  2. *Negative distance or acoustic dead zone*: Reading $< 2\,\text{cm}$ for 3 consecutive samples $\rightarrow$ flag `sensorStatus = "ERROR"`.
  3. *Controller brownout*: Supply voltage drops to $2.7\,\text{V} \rightarrow$ hardware BOD resets controller; upon reboot, relay initializes LOW.
- **Prerequisite**: Fault injection harness in Phase 4.

---

### Test Suite 9: Firebase Communication & Rule Tests
- **Classification**: **TIER 2 (Phase 2 / Cloud Dependent)**
- **Objective**: Verify security rules, payload schemas, and read/write access.
- **Test Cases**:
  1. *Unauthenticated write*: Anonymous write to `/devices/tank-01/live` $\rightarrow$ Rejected (`403 Permission Denied`).
  2. *Schema enforcement*: Client attempts to write string `"full"` to `levelPercent` $\rightarrow$ Rejected by validation rule.
  3. *Device token write*: Authenticated device writes valid telemetry $\rightarrow$ Accepted (`200 OK`).
- **Prerequisite**: Firebase project setup and emulator testing in Phase 2.

---

### Test Suite 10: Dashboard Telemetry Update & UI Reactivity Tests
- **Classification**: **TIER 2 (Phase 3 / Web App)**
- **Objective**: Confirm that incoming Firebase WebSocket events trigger instant DOM updates without page refreshes.
- **Test Cases**:
  1. *Live gauge rendering*: Injected `levelPercent: 65.0` animates water gauge to $65\%$.
  2. *Flow indicator*: Injected `flowRateLpm: 12.5` updates digital meter and triggers wave animation.
  3. *Pump badge*: When `pumpState` switches from `"OFF"` to `"ON"`, badge turns green and pump card pulses.
- **Prerequisite**: Phase 3 dashboard implementation with Firebase SDK.

---

### Test Suite 11: Command Authorization & Acknowledgement Handshake
- **Classification**: **TIER 2 (Phase 3 & 4)**
- **Objective**: Verify that UI treats requested states and confirmed states as decoupled entities.
- **Test Cases**:
  1. Operator submits manual ON command $\rightarrow$ UI enters "Dispatching..." state.
  2. Command node updates to `status: "acknowledged"` $\rightarrow$ UI displays "Controller validating safety...".
  3. Overfill condition active ($96\%$) $\rightarrow$ Controller updates `status: "rejected"` with `statusReason: "High level interlock engaged"` $\rightarrow$ UI displays error alert banner; pump icon remains OFF.
  4. Normal condition active ($50\%$) $\rightarrow$ Controller updates `status: "executed"` and `/live/pumpState` to `"ON"` $\rightarrow$ UI confirms pump active.
- **Prerequisite**: Phase 3 dashboard and Phase 4 firmware.

---

### Test Suite 12: Connectivity Loss & Network Resilience
- **Classification**: **TIER 3 & TIER 4 (Phase 4 & 5)**
- **Objective**: Confirm that the edge controller continues autonomous water regulation during total internet blackout.
- **Test Cases**:
  1. *Wi-Fi AP powered off*: Controller detects Wi-Fi loss, attempts exponential reconnect every $5\,\text{s}$, $10\,\text{s}$, $30\,\text{s}$, $60\,\text{s}$.
  2. *Pumping during blackout*: While Wi-Fi is disconnected, water level drops to $15\% \rightarrow$ pump activates automatically; when level hits $90\% \rightarrow$ pump de-activates automatically.
  3. *Reconnection*: Wi-Fi restored $\rightarrow$ controller resumes cloud telemetry without rebooting.
- **Prerequisite**: Physical Wi-Fi bench setup in Phase 4/5.

---

### Test Suite 13: Notification Backend & SMS Dispatch Tests
- **Classification**: **TIER 4 (Phase 6 / SMS Dependent)**
- **Objective**: Validate serverless Cloud Functions, event triggers, and third-party SMS API communication.
- **Test Cases**:
  1. *Alert event trigger*: Critical alert record written to `/alerts/` $\rightarrow$ Cloud Function fires.
  2. *Cooldown suppression*: Consecutive duplicate alerts within a 15-minute window do not trigger multiple SMS dispatches.
  3. *SMS delivery*: Cloud Function invokes SMS provider REST endpoint $\rightarrow$ receives provider message SID $\rightarrow$ updates alert node with `smsDispatched: true`.
- **Prerequisite**: Phase 6 cloud function deployment and external SMS provider credentials.

---

### Test Suite 14: End-to-End Physical Hardware Integration Tests
- **Classification**: **TIER 4 (Phase 5 / Physical Hardware Dependent)**
- **Objective**: Validate the complete physical system with water, pipes, tanks, and electrical loads.
- **Test Cases**:
  1. *Echo voltage divider*: Verify HC-SR04 Echo pin voltage with oscilloscope does not exceed $3.3\,\text{V}$ under any condition.
  2. *Relay inductive kickback*: Verify flyback diode clamps back-EMF spike to $< 0.7\,\text{V}$ above rail.
  3. *Volumetric calibration*: Flow meter pulses compared against a physical 20-liter graduated container to establish exact $K$-factor.
  4. *Acoustic reflection*: Ultrasonic level readings compared against physical steel ruler at $10\,\text{cm}$, $25\,\text{cm}$, $50\,\text{cm}$, and $80\,\text{cm}$.
- **Prerequisite**: Complete physical bench assembly in Phase 5.
