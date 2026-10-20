# Phase 4 Firmware Architecture Specification
## Smart Water Tank Monitoring System — ESP8266 NodeMCU Hybrid Controller

**Document Reference**: `docs/phase-4/firmware-architecture.md`  
**System Target**: NodeMCU v2 (ESP8266-12E Module, 80MHz, 4MB Flash, 80KB SRAM)  
**Framework**: Arduino / PlatformIO Core  
**Architecture Pattern**: Non-Blocking Cooperative State-Driven Super-Loop with Autonomous Local Safety Interlocks & Cloud Gateway  
**Status**: IMPLEMENTED AND VERIFIED  

---

## 1. Executive Summary & Architectural Philosophy

The Smart Water Tank Monitoring System firmware operates under a **safety-first, zero-trust cloud dependency** philosophy:
1. **Autonomous Local Safety**: The local pump control state machine operates 100% autonomously on the ESP8266. If home Wi-Fi disconnects, the Internet drops, or Firebase servers experience an outage, the controller maintains full hysteresis filling (20% to 95%), enforces the 20-minute maximum runtime cutoff, triggers dry-run protection, and shuts down on sensor timeouts.
2. **Cooperative Non-Blocking Scheduling**: Traditional blocking calls (`delay()`, long HTTP retries) are strictly prohibited in the control path. The main loop evaluates sensors, safety rules, local web clients, and cloud synchronization using non-blocking elapsed time delta counters (`millis()`). Hardware and software watchdogs are fed continuously via `yield()`.
3. **Hybrid Edge & Cloud Architecture**: The device simultaneously operates as a direct Wi-Fi SoftAP host (`192.168.4.1`) serving an embedded responsive web dashboard for local zero-cloud management, and as an authenticated Wi-Fi station synchronizing live telemetry and fetching operator commands from Firebase Realtime Database.
4. **Unified Control Path**: Remote cloud commands and local web commands enter the identical safety validation layer in `PumpController`. No external interface has direct or uncontrolled write access to the relay driver.

---

## 2. Firmware System Architecture & Execution Flow

```mermaid
graph TD
    subgraph Hardware Layer
        US[HC-SR04 Ultrasonic Sensor] -->|1k/2k Divider| GPIO4[D2 / GPIO4 Echo]
        GPIO5[D1 / GPIO5 Trig] -->|Trigger Pulse| US
        FS[ZJ-S201 Flow Sensor] -->|1k/2k Divider| GPIO14[D5 / GPIO14 Pulse Int]
        CS[ACS712-05B Current Sensor] -->|10k/18k Attenuator| ADC0[A0 / ADC0]
        GPIO12[D6 / GPIO12 Relay] -->|Active-LOW Driver| RL[5V Opto-Relay Module]
        RL --> PUMP[12V/24V DC Water Pump]
        LEDS[Status LEDs & Buzzer] <-- GPIO[D0, D4, D8, D7]
    end

    subgraph Sensor Acquisition & Conditioning
        GPIO4 & GPIO5 --> UltrasonicDriver[UltrasonicSensor: Median-of-5 Filter & Freshness]
        GPIO14 --> FlowDriver[FlowSensor: IRAM Interrupt Counter & Plausibility Gate]
        ADC0 --> CurrentDriver[CurrentSensor: ADC Voltage Scaler & RMS Current Window]
    end

    subgraph Autonomous Safety Core
        UltrasonicDriver -->|Water Level % & Freshness| PumpController
        FlowDriver -->|Flow Rate L/min| PumpController
        CurrentDriver -->|Pump Current A| PumpController
        PumpController[PumpController: 7-State Autonomous Machine] -->|Commanded Safe State| RelayDriver
        RelayDriver -->|Safe Output Latched| GPIO12
    end

    subgraph Edge & Cloud Integration
        PumpController <-->|Unified Command Validation| LocalServer[LocalDashboardServer: AP 192.168.4.1]
        PumpController <-->|Deduplication & TTL Validation| FirebaseClient[FirebaseClient: HTTPS REST Client]
        FirebaseClient -->|PUT /tanks/tankId/live| RTDB[(Firebase Realtime Database)]
        FirebaseClient <--|GET /tanks/tankId/commands| RTDB
        FirebaseClient -->|PUT /tanks/tankId/commandAcks| RTDB
    end
```

---

## 3. Module Responsibilities & Boundary Contracts

| Module | Source Location | Responsibility & Contract Boundary |
| :--- | :--- | :--- |
| **`main.cpp`** | `firmware/src/main.cpp` | System orchestrator. Manages boot initialization sequence, executes non-blocking super-loop, coordinates sensor updates (200ms), feeds watchdogs, and logs serial telemetry. |
| **`AppConfig.h`** | `firmware/src/config/AppConfig.h` | Single source of truth for pin definitions, electrical polarities, default calibration thresholds, and safety timings. |
| **`ConfigManager`** | `firmware/src/config/ConfigManager.cpp` | Non-volatile EEPROM store (512 bytes). Handles persistent storage of Wi-Fi credentials, tank ID, device identity, and magic byte validation (`0x544E4B31`). |
| **`UltrasonicSensor`**| `firmware/src/sensors/UltrasonicSensor.cpp` | HC-SR04 driver. Generates 10µs trigger pulses, reads echo duration, executes 5-sample median filter, converts geometry to water level (0–100%), and detects stale readings (>5000ms). |
| **`FlowSensor`** | `firmware/src/sensors/FlowSensor.cpp` | ZJ-S201 pulse counting. Utilizes `IRAM_ATTR` ISR for edge detection, computes flow rate (L/min) with a 60 LPM plausibility gate, and integrates cumulative volume. |
| **`CurrentSensor`** | `firmware/src/sensors/CurrentSensor.cpp` | ACS712 driver. Scaled via $10\,\text{k}\Omega / 18\,\text{k}\Omega$ attenuator ($K_{div} = 0.642857$), calculates zero-offset calibration, RMS motor current, and 0.08A noise gate. |
| **`LeakageSensor`** | `firmware/src/sensors/LeakageSensor.h` | Hardware extension interface. Explicitly disabled pending bench confirmation of physical sensor and pin availability. |
| **`RelayDriver`** | `firmware/src/control/RelayDriver.cpp` | Direct hardware abstraction for GPIO12. Ensures relay is driven to safe HIGH (OFF) level **prior** to enabling output mode to prevent startup glitching. |
| **`PumpController`**| `firmware/src/control/PumpController.cpp` | Core 7-state autonomous state machine. Enforces hysteresis filling, 95% hard cutoff, 20-min runtime limit, 15s dry-run detection, and pre-activation validation. |
| **`AlertManager`** | `firmware/src/diagnostics/AlertManager.cpp` | Human-machine interface. Manages boot-safe indicators: Green LED (Wi-Fi), Yellow LED (Pump Active), Red LED (Fault), and Piezo Buzzer chirps. |
| **`LocalDashboardServer`**| `firmware/src/server/LocalDashboardServer.cpp` | Embedded web server on port 80 with DNS captive portal. Exposes authenticated REST API (`/api/live`, `/api/login`, `/api/command`, `/api/wifi-setup`). |
| **`FirebaseClient`**| `firmware/src/cloud/FirebaseClient.cpp` | HTTPS REST synchronization with Firebase RTDB. Manages live telemetry publication, command polling, replay deduplication, 60s TTL checks, and ACK dispatch. |

---

## 4. Boot-Safe Initialization Sequence

ESP8266 pins have sensitive bootstrapping states during power-on and reset. The initialization sequence in `main.cpp::setup()` strictly follows this order:

1. **Serial Console**: Initialized at 115200 baud for boot diagnostics.
2. **Relay Safety Latch**: `relay.begin()` is invoked **first**. The physical GPIO12 is written HIGH (safe de-energized level for active-LOW relay) before calling `pinMode(12, OUTPUT)`. This prevents any transient relay blips during microcontroller reset.
3. **Diagnostics & Indicators**: `alertMgr.begin()` configures GPIO16, GPIO15, GPIO2, and GPIO13 with correct boot-safe pull-ups.
4. **Flash Button Check**: GPIO0 is sampled with internal pull-up. If held LOW at power-up, manual setup mode is forced.
5. **EEPROM Configuration**: `ConfigManager::begin()` and `ConfigManager::load()` read saved credentials. If unconfigured, the captive portal is launched.
6. **Sensor Zero Calibration**: `currentSensor.calibrateZero()` runs while the pump is verified OFF to establish quiescent ADC offset.
7. **Pump Controller Initialization**: `pumpController.begin()` sets state to `INITIALIZING` with relay OFF.
8. **Network Activation**: SoftAP (`192.168.4.1`) is launched in `WIFI_AP_STA` mode, followed by embedded HTTP server and background station Wi-Fi connection.

---

## 5. Non-Blocking Execution Loop & Watchdog Hygiene

The main control loop in `main.cpp` executes with strict timing boundaries:
- **Sensor Acquisition Cadence**: Evaluated every 200 ms (`now - lastSensorUpdateMs >= 200`).
- **Autonomous Pump Safety Cadence**: Evaluated continuously every loop pass (sub-millisecond latency).
- **Serial Telemetry Cadence**: Printed every 2000 ms to avoid serial buffer congestion.
- **Local Web Server Cadence**: Serves client requests on every loop pass via `localServer.handleClient()`.
- **Cloud Gateway Cadence**:
  - Command poll interval: 1000 ms.
  - Telemetry publish interval: 2000 ms.
  - Wi-Fi health check interval: 5000 ms.
- **Watchdog Feed**: `yield()` is called at the end of every loop pass, keeping the ESP8266 hardware watchdog (`WDT`) and software watchdog (`SWDT`) healthy without triggering panic resets.
