# System Architecture & Technical Specification
## Smart Water Tank Monitoring System

---

## A. System Overview

The **Smart Water Tank Monitoring System** is an IoT-enabled closed-loop automation platform engineered to provide real-time water resource monitoring, consumption tracking, electrical safety supervision, and autonomous pump actuation.

The system is decomposed into four discrete, loosely coupled architectural layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           4. Web Application                            │
│           (Vite + Vanilla JS ES Modules Dashboard, Observability)       │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ HTTPS / WSS
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     3. Cloud Data & Notification Tier                   │
│   (Firebase Realtime DB, Firebase Auth, Cloud Functions, External SMS)  │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ TLS / Wi-Fi
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          2. Embedded Control                            │
│      (ESP8266 NodeMCU, Local Safety Interlocks, Autonomous State)       │
└────────────────────────────────────▲────────────────────────────────────┘
                                     │ GPIO / ADC / Relay
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      1. Sensing & Actuation Layer                       │
│    (HC-SR04 Level, ZJ-S201 Flow, ACS712 Current, Relay, Pump, Alarms)   │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Sensing and Actuation Layer**: Physical transducers and electromechanical actuators interfacing directly with water and electrical lines. Converts ultrasonic time-of-flight, magnetic turbine rotations, and Hall-effect currents into electrical signals, and actuates the DC pump via an isolated relay.
2. **Embedded Control Layer**: The local edge controller powered by the ESP8266 NodeMCU (32-bit Tensilica LX106). Houses the real-time state machine, conducts signal conditioning and median filtering, calculates derived metrics (percentage volume, LPM flow, RMS current), and enforces autonomous safety shutoffs.
3. **Cloud Data and Notifications Layer**: Firebase Realtime Database and supporting serverless functions providing low-latency state synchronization, temporal logging, access control enforcement, and external SMS delivery dispatching.
4. **Web Application Layer**: A responsive, real-time client dashboard built on modern Vanilla JavaScript and Vite. Consumes live telemetry, presents interactive operational controls, charts historical water consumption, and alerts users of anomalies.

---

## B. Data Flow Architecture

The data telemetry pipeline flows unidirectional from raw physical sensors to the user interface:

```
[ Physical Sensors ]
  │ HC-SR04 Ultrasonic Echo
  │ ZJ-S201 Hall-Effect Pulses
  │ ACS712 Analog Voltage
  ▼
[ ESP8266 NodeMCU Edge Controller ]
  │ ADC sampling, interrupt pulse counting, echo timing
  │ Median filtering, calibration math, safety threshold evaluation
  │ Packaging into JSON telemetry payload
  ▼
[ Wi-Fi Network Interface ]
  │ WPA2 Secure Transport / TLS Handshake
  ▼
[ Firebase Realtime Database ]
  │ Writes to /devices/{deviceId}/live
  │ Appends to /devices/{deviceId}/history
  │ Enforces schema & security rules
  ▼
[ Web Dashboard Client ]
  │ Persistent WebSocket connection
  │ Reactive DOM update of gauges, indicators, and charts
```

**Key Data Flow Principles:**
- Edge computation precedes transmission: Raw sensor timings (microseconds, pulse counts) are processed into human-usable engineering units (`levelPercent`, `flowRateLpm`, `pumpCurrentA`) on the ESP8266 before cloud transmission.
- Network bandwidth conservation: High-frequency live data updates are throttled (e.g., every 2–5 seconds during active pumping, every 15–30 seconds during idle state) to balance real-time feedback with Wi-Fi power efficiency.

---

## C. Command Flow Architecture

Manual or scheduled pump actuation flows from the client to the physical relay via an asynchronous command-handshake pattern:

```
[ Web Dashboard Client ]
  │ User clicks "Turn On Pump" or "Switch to Manual Mode"
  ▼
[ Firebase Realtime Database ]
  │ Writes record to /devices/{deviceId}/commands/{commandId}
  │ (status: "pending", requestedState: "ON", timestamp: 1718000000)
  ▼
[ ESP8266 NodeMCU Listener ]
  │ Firebase event stream delivers new pending command record
  ▼
[ Local Safety Validation Engine (ESP8266) ]
  ├── Check 1: Is water level < 95%? (Overfill safety)
  ├── Check 2: Has pump run duration exceeded maximum limit?
  ├── Check 3: Is sensor status valid? (No timeout or open-circuit)
  ├── Check 4: Is dry-run condition cleared?
  │
  ├── IF UNSAFE:
  │     Reject command; write status: "rejected" with reason code;
  │     Maintain relay in OFF state.
  │
  └── IF SAFE:
        Accept command; write status: "acknowledged";
        Energize relay driver pin (GPIO12);
        Confirm pump current via ACS712;
        Update live pump state: "ON";
        Write status: "executed".
```

> [!IMPORTANT]
> **Command Decoupling Principle**: Writing an actuation command to Firebase does **NOT** guarantee that the pump has turned on or executed the request. The web dashboard must treat requested states and confirmed states as distinct entities. Only when the ESP8266 validates local safety rules, actuates the relay, and publishes an updated confirmed `pumpState` in `/live/` is the pump officially confirmed running.

---

## D. Optional Notification Flow Architecture

Emergency and anomaly alerts trigger cloud-dispatched SMS notifications without relying on physical GSM hardware on the embedded controller:

```
[ ESP8266 Edge Controller ]
  │ Detects critical condition:
  │ - Water level critical (e.g., < 10% or >= 98%)
  │ - Dry-run detected (pump running, zero current / zero flow)
  │ - Continuous runtime exceeded (> 20 min)
  │ - Sensor hardware fault / open-circuit
  ▼
[ Firebase Realtime Database ]
  │ Writes alert entry to /devices/{deviceId}/alerts/{alertId}
  ▼
[ Firebase Cloud Functions (Serverless Backend) ]
  │ Database trigger intercepts new alert node
  │ Sanitizes alert message & verifies notification cooldown window
  │ Formulates payload for external SMS Gateway Provider
  ▼
[ External SMS Provider REST API (Twilio / Africa's Talking) ]
  │ Authenticated HTTP POST request over TLS using encrypted credentials
  ▼
[ Cellular Telecom Network ]
  ▼
[ User Mobile Handset (SMS Received) ]
```

**Prerequisites for SMS Operation:**
1. Active account and API credentials with a commercial SMS provider.
2. Secure backend secrets management (environment secrets in Cloud Functions; zero secrets on the ESP8266).
3. Active internet connectivity on both the ESP8266 controller and cloud infrastructure.
4. Cooldown throttling in Cloud Functions to prevent notification spamming and unexpected credit exhaustion during flapping fault conditions.

---

## E. Component Responsibilities

| Component | Category | Key Responsibilities |
| :--- | :--- | :--- |
| **HC-SR04** | Sensor | Emits 40 kHz ultrasonic burst; returns TTL echo pulse proportional to distance from water surface. Provides non-contact liquid level sensing. |
| **ZJ-S201** | Sensor | Hall-effect magnetic turbine pulse sensor installed in piping. Generates pulse stream proportional to volumetric flow rate ($Q = f / 4.8$). |
| **ACS712** | Sensor | Isolated Hall-effect current transducer measuring DC pump current ($V_{out} = V_{cc}/2 + (I \times \text{Sensitivity})$). Detects motor load, stalls, and open circuits. |
| **ESP8266 NodeMCU** | Controller | Central embedded brain. Samples sensors, executes hard safety interlocks, manages state machine, drives relay & indicators, maintains Wi-Fi, syncs telemetry. |
| **Relay (JQC3F-05VDC-C)** | Actuator | Electromechanical 5V SPDT relay providing electrical galvanic isolation between 3.3V/5V logic and the high-current DC pump power supply. |
| **DC Water Pump** | Actuator | 12V DC centrifugal pump delivering water into or out of the tank based on system demands. |
| **LEDs (Red, Yellow, Green)** | Indicators | Visual edge indicators: Green = System normal / Wi-Fi connected; Yellow = Pump running / standby warning; Red = Hardware fault / dry-run / critical level. |
| **Piezo Buzzer** | Indicator | Auditory alarm emitting distinct frequency beeps for critical overfill, dry-run cutoffs, or sensor failure. |
| **Firebase Realtime DB** | Cloud | Synchronizes real-time state via WebSockets, persists temporal telemetry logs, enforces role-based access rules. |
| **Web Dashboard** | Application | Operator UI displaying live gauges, charts, operational status, alert banners, and authorized manual override controls. |
| **Optional SMS Backend** | Cloud | Serverless function listening for alert records and dispatching SMS via external telecom APIs without embedded GSM overhead. |

---

## F. Planned Firmware Modules

When developed in Phase 4 and Phase 5, the embedded C++ codebase will be organized into isolated functional modules:

1. **`SensorAcquisition`**: Manages low-level pin reading, non-blocking ultrasonic trigger pulses, interrupt service routines (ISR) for flow pulse accumulation, and analog ADC sampling.
2. **`WaterLevelCalculation`**: Converts raw echo flight time ($\mu s$) into distance ($cm$), applies a moving median filter across 5 samples to discard spurious reflections, and maps physical distance to calibrated tank volume percentage ($0.0\% - 100.0\%$).
3. **`FlowConsumptionCalculation`**: Converts accumulated flow pulses into instantaneous liters per minute (LPM) and increments persistent total liters consumed.
4. **`CurrentMeasurement`**: Samples ACS712 voltage over full electrical cycles, applies zero-offset correction, calculates RMS current, and flags over-current or under-current anomalies.
5. **`PumpControl`**: Houses the operational state machine (`AUTO` vs `MANUAL`). Manages hysteresis band logic (turn ON at $\le 20\%$, turn OFF at $\ge 90\%$ in `AUTO`), soft start delays, and minimum cycle cooldown timers.
6. **`FaultDetection`**: Continuously evaluates edge conditions:
   - Level sensor out of range ($< 2 \text{ cm}$ or $> \text{Tank Height} + 10 \text{ cm}$).
   - Flow meter zero response while pump commanded active.
   - Motor current outside normal operating window.
7. **`IndicatorControl`**: Coordinates LED blinking patterns and buzzer frequencies according to system state priorities.
8. **`WiFiManagement`**: Manages 802.11 b/g/n association, monitors connection health, and executes exponential backoff reconnects without stalling the safety control loop.
9. **`CloudTelemetry`**: Serializes system metrics into JSON structures and updates Firebase Realtime Database endpoints at throttled intervals.
10. **`CommandValidation`**: Subscribes to the `/commands/` endpoint, validates command structure and timestamps, interrogates the safety engine, and writes execution acknowledgements.

---

## G. Safety and Failure Handling Architecture

The system is designed with an **Autonomous Edge-First Safety Philosophy**. The embedded controller must remain 100% capable of protecting life, property, and mechanical components even in the complete absence of cloud or network connectivity.

```
                    ┌─────────────────────────┐
                    │    PUMP ACTUATION LOOP   │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [ AUTOMATIC ENGINE ]            [ MANUAL OVERRIDE ]
                 │                               │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
                 ┌───────────────────────────────┐
                 │ HARDWARE SAFETY INTERLOCK GATE │
                 │      (Always Evaluated)       │
                 └───────────────┬───────────────┘
                                 │
  ├── Level >= High Cutoff (95%)? ──────> [ IMMEDIATE FORCED SHUTOFF ]
  ├── Continuous Run >= 20 mins? ───────> [ TIMEOUT FORCED SHUTOFF ]
  ├── Sensor Timeout / Open Loop? ──────> [ FAULT FORCED SHUTOFF ]
  ├── Motor Current Under/Over? ────────> [ DRY-RUN / STALL SHUTOFF ]
  ├── Cloud / Wi-Fi Disconnected? ──────> [ CONTINUE AUTONOMOUS SAFETY ]
  │
  └── ALL CONDITIONS PASS? ─────────────> [ ENERGIZE RELAY ]
```

### Safety Rules & Contingency Protocols:

1. **High-Level Autonomous Cutoff**: If water level reaches $\ge 95\%$, the relay is immediately de-energized, regardless of whether the pump was activated automatically or via manual dashboard override.
2. **Maximum Continuous Pump Runtime**: To prevent flooding from pipe detachment or structural damage, a hardware timer terminates pump operation after a fixed continuous duration (default: 20 minutes), requiring a manual operator reset.
3. **Invalid Sensor Reading Handling**: If the ultrasonic sensor returns zero, timeout ($> 38 \text{ ms}$), or a value exceeding physical tank dimensions for 3 consecutive cycles, the controller transitions to `FAULT` state, halts the pump, and activates the red LED and audible buzzer.
4. **Sensor Timeout Protection**: If the flow sensor or current sensor fails to report during active pumping, the condition is logged and evaluated against dry-run and stall rules.
5. **Wi-Fi and Cloud Outage Isolation**: The pump control loop and safety interlocks run synchronously in the primary microcontroller loop; cloud telemetry is completely non-blocking. If Wi-Fi or Firebase drops, the pump continues to manage water level locally according to calibrated thresholds. **The system never relies on cloud connectivity to turn off the pump.**
6. **Controller Brownout / Restart Recovery**: Upon hardware reset or power restoration, all actuator GPIOs initialize to `LOW` (Relay OFF). The controller evaluates current tank level and sensor health before initiating any pump action.
7. **Rejection of Unsafe Commands**: Any command from the cloud requesting pump activation when the water level is $\ge 95\%$ or when a fault state is active is rejected immediately with an error reason logged to the database.
8. **Pump-Source Dry-Run Protection**: When fully integrated with source supply monitoring (or inferred via current/flow drop while pump is commanded ON), the pump is shut down within 5 seconds to prevent thermal destruction of the impeller.

---

## H. Security Architecture

1. **Firebase Authentication**: Dashboard access requires authenticated administrative credentials (JWT tokens). Unauthenticated public users cannot inspect tank status or dispatch commands.
2. **Granular Database Security Rules**:
   - Write access to `/devices/{deviceId}/live` is locked down exclusively to the ESP8266 controller's authenticated identity.
   - Write access to `/devices/{deviceId}/commands` is restricted to authorized operators.
   - Validation expressions reject malformed, out-of-range, or excessive telemetry values.
3. **Transport Layer Security**: All data exchanged between ESP8266 and Firebase, and between Firebase and the Dashboard, is encrypted via TLS 1.2 / 1.3.
4. **Separation of Concerns & Secret Management**:
   - ESP8266 firmware contains only its Wi-Fi credentials and device-level database secret/token.
   - SMS provider tokens (Twilio Account SID, Auth Token) are isolated strictly inside serverless Cloud Functions environment variables.
   - No cloud service keys, database admin secrets, or third-party tokens are exposed in dashboard client code or public repositories.

---

## I. Progressive Testing Sequence

Implementation across future phases follows a rigorous test progression:

```
Step 1: Environment & Build Validation (Phase 1 - Current)
   └── Vite build, pure ES module bundling, zero lint errors, verified toolchain.

Step 2: Schema & Mock Contract Testing (Phase 2)
   └── Firebase rule unit tests, mock telemetry injection, schema enforcement.

Step 3: Dashboard Reactivity & UI State Testing (Phase 3)
   └── Mock state rendering, live gauge response, command dispatch decoupling.

Step 4: Algorithmic Simulation (Phase 4)
   └── Unit testing level math, moving median filter, flow integration, RMS math.

Step 5: Cloud Handshake & Command Validation (Phase 4)
   └── Rejection of overfill commands, acknowledgement state transitions.

Step 6: Notification Backend Integration (Phase 6)
   └── Cloud function trigger tests, payload formatting, SMS API mocking.

Step 7: Physical Hardware & Electrical Integration (Phase 5)
   └── Signal level verification, 3.3V logic translation, relay inductive test, live tank wet test.
```
