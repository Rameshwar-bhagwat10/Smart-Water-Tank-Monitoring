# Embedded Firmware — ESP8266 NodeMCU v2
## Smart Water Tank Monitoring System — Phase 3 Production Baseline

---

## 1. Overview
This directory contains the production-grade, modular C++ firmware for the **Smart Water Tank Monitoring System** edge controller running on the **ESP8266 NodeMCU (ESP-12E)**.

The controller operates as an autonomous edge safety unit:
- **Zero-Touch Wi-Fi Captive Portal & Dynamic Tank Provisioning**: Mobile phone setup portal (`SmartTank-Setup-XXXX` at `192.168.4.1`) to configure local 2.4 GHz Wi-Fi and assign the Tank ID without re-flashing.
- **Non-Volatile Flash Memory (EEPROM)**: Persists Wi-Fi credentials and assigned Tank ID permanently across power outages.
- **Hardware Reset Trigger**: Holding the Flash button (GPIO0 / D3) for 5 seconds resets configuration and re-enters setup portal.
- **Serial Console Controls**: Type `SET_TANK <tankId>` or `RESET_CONFIG` directly in the Serial Monitor for rapid desk testing.
- **Non-blocking sensor acquisition**: HC-SR04 ultrasonic, ZJ-S201 flow, ACS712 current.
- **Hard real-time local safety interlocks**: High-level cutoff (>=95%), max runtime limit (20 min), dry-run trip, sensor fault lockout independent of cloud or Wi-Fi availability.
- **Active-LOW relay actuation**: Asserted safe de-energized boot sequence.
- **Diagnostic audio-visual feedback**: Tri-color LEDs (Green/Yellow/Red) and piezo buzzer.
- **Firebase HTTPS REST synchronization**: Live telemetry publishing, command polling, command execution verification, and command acknowledgements.

---

## 2. Directory Structure

```
firmware/
├── platformio.ini              # PlatformIO build configuration for nodemcuv2 (ESP8266)
├── include/
│   ├── secrets.example.h       # Sanitized credential template (Wi-Fi, Firebase, Tank ID)
│   └── secrets.h               # Local active device configuration (git-ignored)
├── src/
│   ├── main.cpp                # Setup, loop, portal trigger, non-blocking orchestration
│   ├── config/
│   │   ├── AppConfig.h         # Pinouts, calibration constants, safety thresholds, timers
│   │   ├── ConfigManager.h     # Non-volatile EEPROM device configuration manager
│   │   └── ConfigManager.cpp
│   ├── portal/
│   │   ├── CaptivePortal.h     # Mobile Wi-Fi setup & Tank ID provisioning portal
│   │   └── CaptivePortal.cpp
│   ├── sensors/
│   │   ├── UltrasonicSensor.h  # HC-SR04 driver, median filter, level percent conversion
│   │   ├── UltrasonicSensor.cpp
│   │   ├── FlowSensor.h        # ZJ-S201 interrupt counter, flow rate (L/min) and volume (L)
│   │   ├── FlowSensor.cpp
│   │   ├── CurrentSensor.h     # ACS712 RMS current sampling, zero-offset calibration
│   │   └── CurrentSensor.cpp
│   ├── control/
│   │   ├── RelayDriver.h       # Active-LOW safe relay pin driver
│   │   ├── RelayDriver.cpp
│   │   ├── PumpController.h    # Autonomous state machine, hysteresis (20%/95%), lockouts
│   │   └── PumpController.cpp
│   ├── diagnostics/
│   │   ├── AlertManager.h      # Tri-color LED & buzzer status indicator engine
│   │   └── AlertManager.cpp
│   └── cloud/
│       ├── FirebaseClient.h    # HTTPS REST client for /live, /commands, /commandAcks, /alerts
│       └── FirebaseClient.cpp
```

---

## 3. Hardware Pin Mapping (ESP8266 NodeMCU)

| NodeMCU Pin | ESP8266 GPIO | Connected Component & Signal | Direction | Electrical Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| **D1** | `GPIO5` | **HC-SR04 Trigger** | Output | 3.3V logic high trigger pulse ($10\,\mu\text{s}$) |
| **D2** | `GPIO4` | **HC-SR04 Echo** | Input | **5V TTL shifted to 3.3V** via 1k$\Omega$/2k$\Omega$ divider |
| **D5** | `GPIO14` | **ZJ-S201 Flow Sensor Pulse** | Input | Frequency pulse train with pull-up |
| **A0** | `ADC0` | **ACS712 Current Sensor Out** | Analog In | 0.0V to 3.3V range via NodeMCU internal divider |
| **D6** | `GPIO12` | **Relay Driver Input** | Output | Active-LOW logic drive (boot-safe) |
| **D7** | `GPIO13` | **Piezo Buzzer Driver** | Output | 3.3V active toggle via NPN transistor |
| **D0** | `GPIO16` | **Green LED** (System / Wi-Fi OK) | Output | 3.3V active-high through 220$\Omega$ resistor |
| **D8** | `GPIO15` | **Yellow LED** (Pump Running) | Output | 3.3V active-high (pulled LOW during boot) |
| **D3** | `GPIO0` | **Red LED / Reset Button** | In/Out | Flash button (hold 5s to reset EEPROM to portal) |

---

## 4. How to Use the Wi-Fi Captive Portal (Smartphone Setup)

1. **Power up the NodeMCU**: If the board has no saved Wi-Fi configuration (or if you hold the Flash button at boot), it creates a Wi-Fi hotspot:
   `SmartTank-Setup-XXXX`
2. **Connect Phone**: Open your phone's Wi-Fi settings and connect to `SmartTank-Setup-XXXX`.
3. **Setup Page**: Your phone automatically opens the setup window (or browse to `http://192.168.4.1`).
4. **Configure Settings**:
   - Select your 2.4 GHz Wi-Fi router.
   - Enter your Wi-Fi password.
   - Enter your **Assigned Tank ID** (e.g. `tank-01`, `tank-02`).
   - Click **Save & Connect Tank**.
5. **Restart**: The NodeMCU saves these settings permanently to EEPROM and restarts, immediately uploading to `/tanks/{tankId}/live`!

---

## 5. Serial Monitor Quick Testing Commands

While testing on your desk with a single board, open the Serial Monitor (115200 baud) to switch targets instantly without re-flashing:
- `SET_TANK tank-02` &rarr; Dynamically reassigns the board to `tank-02` and saves to flash.
- `SET_TANK tank-01` &rarr; Dynamically switches back to `tank-01`.
- `RESET_CONFIG` &rarr; Clears EEPROM and boots into Captive Portal setup mode.
- `STATUS` &rarr; Prints current tank ID, Wi-Fi link status, and pump state.

---

## 6. Building and Flashing

### Prerequisites
- Python 3.10+
- PlatformIO Core: `pip install platformio`

### Compilation
From the project root:
```bash
python -m platformio run -d firmware
```

### Uploading to Device
Connect the NodeMCU via USB and execute:
```bash
python -m platformio run -d firmware --target upload
```

### Serial Monitor
```bash
python -m platformio device monitor -d firmware -b 115200
```
