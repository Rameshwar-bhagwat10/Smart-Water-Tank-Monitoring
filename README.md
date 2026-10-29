# Smart Water Tank Monitoring System

An IoT-based water management and autonomous pump supervision platform powered by the **ESP8266 NodeMCU**, **Firebase Realtime Database**, and a high-performance **Vanilla JavaScript (Vite)** dashboard.

---

## 1. Project Overview

The **Smart Water Tank Monitoring System** provides end-to-end observability and closed-loop control over residential and industrial water storage tanks. By unifying non-contact water level measurement, volumetric flow metering, and motor current diagnostics onto an edge microcontroller, the system automates water replenishment, prevents tank overflows, protects pumps against dry-running, and streams real-time telemetry to a centralized web application.

---

## 2. Problem Statement

Conventional water storage tanks frequently suffer from significant operational inefficiencies:
- **Catastrophic Overflows**: Manual pump switching or delayed intervention leads to continuous water wastage, structural water damage, and inflated utility bills.
- **Dry-Run Motor Burnout**: Submersible and centrifugal water pumps operating without sufficient water intake overheat rapidly, causing irreversible impeller and motor winding destruction.
- **Lack of Usage Observability**: Property owners have zero visibility into daily consumption trends, pipe throughput, or pump health.
- **Unreliable Cloud-Only Automation**: Smart systems that depend strictly on cloud connectivity fail to shut off pumps during Wi-Fi or cloud outages, resulting in unmitigated flooding.

---

## 3. Project Objectives

1. **Autonomous Edge Safety**: Implement local, hard real-time safety interlocks on the ESP8266 to halt the pump upon detecting high water levels ($\ge 95\%$), dry-running, or continuous runtime timeouts ($> 20\text{ min}$), completely independent of Wi-Fi or cloud availability.
2. **Accurate Fluid & Electrical Sensing**: Deliver non-contact ultrasonic liquid depth sensing, turbine-based pulse flow monitoring, and Hall-effect AC/DC current measurement.
3. **Low-Latency Telemetry**: Stream sensor metrics and actuator states to Firebase Realtime Database over secured Wi-Fi.
4. **Lightweight Dashboard Observability**: Provide an operator web interface built with pure ES modules and Vite for real-time monitoring, historical usage analytics, and authorized manual overrides.
5. **Decoupled Alert Notification**: Architect cloud-driven SMS alert dispatching via serverless functions and external SMS APIs, eliminating physical GSM hardware complexity.

---

## 4. Hardware Components & Responsibilities

The system is engineered around the following physical bill of materials:

| Component | Function & Responsibilities |
| :--- | :--- |
| **ESP8266 NodeMCU (ESP-12E)** | Main edge controller. Executes real-time sensor sampling, median filtering, autonomous safety logic, relay switching, LED/buzzer signaling, and Wi-Fi telemetry synchronization. |
| **HC-SR04 Ultrasonic Sensor** | Non-contact liquid level sensing. Measures acoustic time-of-flight from the tank roof to calculate water surface distance and remaining percentage capacity. |
| **ZJ-S201 Water Flow Sensor** | Inline Hall-effect turbine pulse meter. Generates frequency pulses proportional to volumetric flow rate ($Q = f / 4.8$) to calculate flow rate ($\text{L/min}$) and total volume consumed ($\text{Litres}$). |
| **ACS712 Current Sensor** | Hall-effect current transducer placed in series with the DC pump. Measures motor current draw ($\text{Amperes}$) to detect load states, dry-running, and motor stalls. |
| **JQC3F-05VDC-C Relay** | Electromechanical 5V SPDT relay providing galvanic isolation between 3.3V/5V logic and the high-current DC motor power supply. Driven via transistor/optocoupler stage with flyback diode protection. |
| **DC Water Pump** | 12V DC centrifugal pump responsible for fluid transfer into the tank. |
| **Status LEDs (Red, Yellow, Green)** | Local visual indicators: Green = System normal / Wi-Fi connected; Yellow = Pump running / standby warning; Red = Hardware fault / dry-run / critical level. |
| **Piezo Buzzer** | Local auditory alarm sounding distinct acoustic patterns for critical high-level overfill, dry-run cutoffs, or sensor failures. |
| **Ancillary Hardware** | Regulated 5V DC and 12V DC power supplies, logic level dividers ($1\,\text{k}\Omega / 2\,\text{k}\Omega$), bypass capacitors, terminal blocks, and heavy-gauge ($\ge 18\,\text{AWG}$) motor wiring. |

### Explicit Scope Exclusions (Hardware)
To maintain project safety and architectural focus:
- **Leakage Detection** is outside the current scope.
- **Bluetooth Modules (e.g., HC-05/HC-06)** are not used.
- **Physical GSM / GPRS Modules (e.g., SIM800L/SIM900)** are not used. Cellular messaging is handled via cloud-based SMS gateway APIs.

---

## 5. Fixed Software Technology Stack

### Web Dashboard
- **Markup & Styling**: HTML5, Vanilla CSS3 (Custom CSS design tokens, glassmorphism, responsive grid).
- **Core Scripting**: Vanilla JavaScript using native ES Modules (No React, Angular, or Vue).
- **Build Tool & Dev Server**: [Vite](https://vitejs.dev/) for fast local development and optimized production bundling.
- **Future Dashboard Dependencies**: Firebase JavaScript SDK (Phase 2), Chart.js (Phase 3).

### Embedded Firmware
- **Target Platform**: ESP8266 NodeMCU (ESP-12E).
- **Development Toolchain**: Arduino IDE / Arduino CLI.
- **Language**: C++.
- **Framework**: ESP8266 Arduino Core.
- **Future Libraries**: ESP8266WiFi, Firebase-ESP-Client / FirebaseArduino (Phase 4).

### Cloud Infrastructure
- **Real-Time Synchronization**: Firebase Realtime Database.
- **Access Control & Identity**: Firebase Authentication (Email/Password or JWT).
- **Static Hosting**: Firebase Hosting.
- **Serverless Integration**: Firebase Cloud Functions (Node.js runtime) for external SMS gateway integration.

### Development Environment
- **Runtime**: Node.js $\ge 18$ LTS
- **Package Manager**: npm
- **Version Control**: Git
- **Editor**: Visual Studio Code

---

## 6. Main Features

- **Autonomous Edge Safety**: Guaranteed local pump cutoff on high level ($\ge 95\%$) or continuous timeout ($20\,\text{min}$), immune to cloud disconnection.
- **Real-Time Level & Volume Tracking**: Ultrasonic non-contact water level monitoring with median spike filtering.
- **Volumetric Consumption Analytics**: Continuous flow rate monitoring and cumulative water consumption calculation.
- **Electrical Pump Diagnostics**: Real-time motor current monitoring for dry-run and motor stall detection.
- **Asynchronous Command Handshake**: Secure separation of requested pump states from confirmed physical execution states.
- **Cloud SMS Alert Dispatch**: Cloud functions trigger external SMS alerts for critical incidents without physical GSM hardware on the tank.

---

## 7. System Architecture Overview

The system operates across four coordinated layers:
1. **Sensing & Actuation**: Physical sensors (ultrasonic, turbine flow, Hall current) and actuators (relay, DC pump, LEDs, buzzer).
2. **Embedded Edge Control**: ESP8266 running autonomous safety logic, state machines, and non-blocking Wi-Fi communication.
3. **Cloud Data & Notification Tier**: Firebase Realtime Database enforcing security rules, paired with Cloud Functions for SMS gateway dispatching.
4. **Web Observability Dashboard**: Pure Vanilla JS / Vite application displaying real-time metrics and operational controls.

Complete architectural details, data flow diagrams, and safety mechanisms are documented in:
- [docs/architecture.md](file:///d:/projects/Smart%20Water%20Tank/docs/architecture.md)

---

## 8. Development Phases

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Project Setup & Architecture Baseline (CURRENT PHASE)         │
│  - Repository scaffolding, Vite setup, software contracts, git config  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Firebase Configuration & Database Schema                      │
│  - Realtime DB provisioning, security rules, device auth, mock data    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Real-Time Web Dashboard Implementation                        │
│  - Live gauges, Chart.js trends, manual command controls, alerts banner │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 4: Embedded Firmware Development (ESP8266)                       │
│  - Sensor drivers, C++ safety interlocks, Wi-Fi manager, Firebase sync │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 5: Hardware Integration & Physical Validation                    │
│  - Circuit assembly, level shifter verification, bench tank wet-run   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 6: Cloud Notification Service (Optional SMS)                     │
│  - Cloud Functions, external SMS API integration, production sign-off  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Safety Requirements

1. **Edge Autonomy**: The pump must turn off automatically when the tank is full, even if Wi-Fi or Firebase is completely disconnected.
2. **Hard High-Level Interlock**: Any commanded or manual state is forcibly overridden to `OFF` if water level reaches $\ge 95\%$.
3. **Maximum Continuous Run Timer**: The pump is automatically shut off after 20 minutes of continuous runtime to prevent runaway flooding.
4. **Logic Level Integrity**: All 5V signals (HC-SR04 Echo, flow pulses) must be stepped down to 3.3V before reaching ESP8266 GPIO pins.
5. **Electrical Isolation & Motor Current**: Motor currents must never pass through breadboard tracks; an isolated relay and dedicated 12V supply must be used.

---

## 10. Current Implementation Status

> [!IMPORTANT]
> **Status**: **Phase 3 Complete — Real-Time Web Dashboard, Hybrid Engine & Admin Provisioning Verified.**
> 
> - **Implemented**:
>   - **Phase 1 Baseline**: Project structure, Vite build system, Git exclusions, and technical architecture specifications.
>   - **Phase 2 Firebase Core**: Modular Firebase JS SDK initialization, Email/Password authentication, and deny-by-default [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json) enforcing multi-tenant RBAC and 5-attribute command schemas.
>   - **Phase 3 Web Dashboard & Hybrid Engine**:
>     - **Admin Portal**: 4 segmented modules (Fleet Overview with visual cylinder gauges, Add & Manage Operators with atomic sequential tank allocation, Tank & Wi-Fi Provisioning Wizard with controller scanning/push, Deep-Dive Tank Controller).
>     - **Dedicated Operator Portal**: Role-isolated single-tank view with live telemetry and verified relay feedback.
>     - **Hybrid Engine**: Seamless Cloud Gateway and Direct Local Link (`192.168.4.1`) modes with auto-tank detection.
>     - **Automated Verification**: 64 passing automated tests across 4 test suites (100% pass rate).
> - **Next Up**:
>   - **Phase 4**: ESP8266 C++ embedded firmware drivers, autonomous safety interlocks, and hardware integration.
>   - **Phase 5**: Physical circuit assembly, level translation, and bench tank wet-run.
>   - **Phase 6**: Cloud Functions serverless backend and external SMS provider integration.

---

## 11. Setup Instructions

### Prerequisites
- Node.js LTS ($\ge 18.x$)
- npm ($\ge 9.x$)
- Git ($\ge 2.x$)

### Dashboard Installation
```powershell
# Navigate to the dashboard directory
cd "d:\projects\Smart Water Tank\dashboard"

# Configure environment variables (ensure .env.local exists with your VITE_FIREBASE_* keys)
# See dashboard/.env.example for template

# Install dependencies
npm install

# Start the local development server
npm run dev
```

The dashboard will be available at: `http://localhost:5173/`

---

## 12. Verification & Testing Commands

To run all automated unit and security rules test suites:

```powershell
cd "d:\projects\Smart Water Tank\dashboard"

# Run all automated test suites (30 tests)
npm test

# Run individual suites
npm run test:unit
npm run test:rules

# Run production build
npm run build
```

---

## 13. Future Integration Milestones

- **Milestone 3.0**: Real-time analytical dashboard with interactive Chart.js consumption graphs.
- **Milestone 4.0**: ESP8266 Arduino Core firmware with non-blocking sensor acquisition and autonomous failsafe interlocks.
- **Milestone 5.0**: Physical bench circuit assembly, level shifter verification, and wet testing with physical water pump and tank.
- **Milestone 6.0**: Cloud Functions deployment and third-party SMS gateway alert dispatching.

---

## Documentation Links
- [MULTI_DEVICE_SETUP.md](file:///d:/projects/Smart%20Water%20Tank/MULTI_DEVICE_SETUP.md) — **Multi-Device Setup & Operation Guide** (Operate from Phone/Tablet/Laptop, or install on another PC).
- [docs/architecture.md](file:///d:/projects/Smart%20Water%20Tank/docs/architecture.md) — Complete 4-layer system architecture, data/command flows, safety rules, and security.
- [docs/firebase-setup.md](file:///d:/projects/Smart%20Water%20Tank/docs/firebase-setup.md) — Firebase configuration, user provisioning, deployment, and troubleshooting.
- [docs/firebase-security.md](file:///d:/projects/Smart%20Water%20Tank/docs/firebase-security.md) — Security rules breakdown, RBAC model, device auth strategy, and secrets management.
- [docs/firebase-testing.md](file:///d:/projects/Smart%20Water%20Tank/docs/firebase-testing.md) — Quality assurance matrix, 19 rule test scenarios, and environment findings.
- [docs/firebase-initial-data.json](file:///d:/projects/Smart%20Water%20Tank/docs/firebase-initial-data.json) — Documented schema initialization baseline distinguishing real vs uninitialized state.
- [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json) — Production Realtime Database security rules.
- [docs/database-schema.md](file:///d:/projects/Smart%20Water%20Tank/docs/database-schema.md) — Firebase schema contracts for live telemetry, command handshakes, history, and alerts.
- [docs/pin-mapping.md](file:///d:/projects/Smart%20Water%20Tank/docs/pin-mapping.md) — Provisional ESP8266 pin assignments, strapping pin warnings, and electrical isolation rules.
- [docs/testing-plan.md](file:///d:/projects/Smart%20Water%20Tank/docs/testing-plan.md) — 14-suite testing strategy distinguishing Phase 1/2 executable tests from future hardware tests.
- [firmware/README.md](file:///d:/projects/Smart%20Water%20Tank/firmware/README.md) — Embedded firmware module definitions and toolchain requirements.
- [backend/README.md](file:///d:/projects/Smart%20Water%20Tank/backend/README.md) — Cloud functions, Firebase rules, and SMS gateway architecture.
- [tests/README.md](file:///d:/projects/Smart%20Water%20Tank/tests/README.md) — Testing strategy overview.
