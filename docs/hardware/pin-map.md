# ESP8266 NodeMCU Pin Allocation & Bootstrapping Matrix

**Document Reference**: `docs/hardware/pin-map.md`  
**Audit Finding Addressed**: `HW-001` (Critical / P0) — Boot Strapping Pin Conflicts  
**Target Hardware**: NodeMCU v2 / v3 (ESP-12E / ESP-12F Module, 80 MHz, 4MB Flash)  
**Status**: DESIGN VERIFIED & CODE REMEDIATED — PENDING PHYSICAL MULTIMETER BENCH VALIDATION  

---

## 1. Executive Summary & HW-001 Remediation

During the pre-Phase-4 audit, `HW-001` revealed severe strapping pin conflicts:
1. `PIN_LED_RED` was previously assigned to `D3` (`GPIO0`). On ESP8266, GPIO0 is a primary boot-strapping pin that must be **HIGH** at reset for SPI Flash boot. Connecting an active-high LED (anode to pin, cathode to ground) created a pull-down path that trapped the microcontroller in UART download/programming mode on power-up.
2. `PIN_LED_YELLOW` was assigned to `D8` (`GPIO15`). GPIO15 must be **LOW** at boot. Any circuit pulling it HIGH halts the chip.
3. `PIN_RELAY` on `D6` (`GPIO12`) must guarantee zero output transients during bootloader ROM execution.

### Architectural Fix Implemented:
- **`PIN_LED_RED` moved from GPIO0 (D3) to GPIO2 (D4)**.
  - NodeMCU `GPIO2` (D4) has an on-module 10k pull-up resistor to 3.3V and is connected to the onboard blue LED.
  - Configured as **Active-LOW** (`RED_LED_ACTIVE_LOW = true` in `firmware/src/config/AppConfig.h` and `AlertManager.cpp`).
  - At power-on and reset, the external pull-up naturally keeps GPIO2 HIGH (satisfying the ESP8266 boot requirement: GPIO2 must be HIGH at boot). When the alarm is triggered, the firmware drives GPIO2 LOW to illuminate the LED.
- **`D3` (`GPIO0`) reassigned strictly to the Onboard Flash / Setup Recovery Button**.
  - Pulled HIGH to 3.3V via the onboard 10k resistor.
  - Held LOW by a human operator only when intentionally forcing captive portal / setup mode at power-up.
- **`PIN_LED_YELLOW` on `D8` (`GPIO15`) documented and verified as Active-HIGH**.
  - NodeMCU has an onboard 12k pull-down resistor on GPIO15 to ground.
  - Wiring the yellow LED with anode to D8 and cathode to GND through a 470Ω resistor ensures the line remains firmly at 0V (LOW) during power-up, satisfying the ESP8266 boot requirement.

---

## 2. Complete NodeMCU Pin Allocation Table

| NodeMCU Label | ESP8266 GPIO | Assigned Peripheral | Direction | Electrical Constraints & Interfacing | Bootloader Strapping State | Boot Sensitivity & Safe Operation Rules | Validation Status |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :---: |
| **D0** | `GPIO16` | System / Wi-Fi OK LED (Green) | Output | 3.3V Active-HIGH via 330Ω resistor. Max 12 mA. | Floating / HIGH | User I/O / Deep Sleep Wake. No interrupt support. Safe for LED. | Code Verified |
| **D1** | `GPIO5` | HC-SR04 Ultrasonic Trigger | Output | 3.3V pulse ($10\,\mu\text{s}$). Direct drive. | HIGH-Z | General Purpose I/O (SCL). Boot safe. | Code Verified |
| **D2** | `GPIO4` | HC-SR04 Ultrasonic Echo | Input | **5V TTL stepped down to 3.3V** via 1kΩ / 2kΩ resistive divider. | HIGH-Z | General Purpose I/O (SDA). Boot safe. | Code Verified |
| **D3** | `GPIO0` | Onboard Flash / Setup Recovery Button | Input | Onboard 10kΩ pull-up to 3.3V. Active-LOW button to GND. | **MUST BE HIGH** | **STRAPPING PIN**: If LOW at boot, chip enters UART flashing mode. Never attach pull-down loads. | Code Verified |
| **D4** | `GPIO2` | Fault / Safety Alarm LED (Red) | Output | **3.3V Active-LOW**. Pulls down to light. Onboard 10kΩ pull-up to 3.3V. | **MUST BE HIGH** | **STRAPPING PIN**: Must be HIGH at boot. Active-LOW configuration preserves boot high state. | Code Verified |
| **D5** | `GPIO14` | ZJ-S201 Water Flow Sensor | Input | Hardware Interrupt (attachInterrupt). 5V pulse stepped down to 3.3V via 1kΩ / 2kΩ divider. | HIGH-Z | HSPI SCK. Boot safe. | Code Verified |
| **D6** | `GPIO12` | Pump Relay Driver Control | Output | Active-LOW logic (`RELAY_ACTIVE_LOW = true`). Latched HIGH in `RelayDriver::begin()` before `pinMode(OUTPUT)`. | HIGH-Z | HSPI MISO. Boot safe. Pre-latched to prevent relay chatter on boot. | Code Verified |
| **D7** | `GPIO13` | Piezo Alarm Buzzer | Output | Driven via NPN switching transistor (2N2222) with 1kΩ base resistor. | HIGH-Z | HSPI MOSI / UART0 CTS. Boot safe. | Code Verified |
| **D8** | `GPIO15` | Pump Active LED (Yellow) | Output | 3.3V Active-HIGH (Anode to D8, Cathode to GND via 470Ω). | **MUST BE LOW** | **STRAPPING PIN**: Must be LOW at boot. External load must never pull line HIGH. | Code Verified |
| **RX (D9)** | `GPIO3` | UART0 Serial RX | Input | Dedicated to USB-UART (CH340G / CP2102) communication at 115200 baud. | HIGH | Do not reassign. Dedicated to Serial console. | Code Verified |
| **TX (D10)**| `GPIO1` | UART0 Serial TX | Output | Dedicated to USB-UART communication at 115200 baud. Emits boot log. | HIGH / TX | Do not reassign. Outputs boot ROM diagnostics. | Code Verified |
| **A0** | `ADC0` (`TOUT`) | ACS712 Current Sensor | Analog In | 0–3.3V input range. Sensor $V_{out}$ (2.5V quiescent, 0–5V span) conditioned via 10kΩ / 20kΩ divider. | Analog | Single 10-bit SAR ADC (1024 counts). Max voltage on raw chip is 1.0V; NodeMCU board divider handles up to 3.3V. | Code Verified |

---

## 3. Detailed Boot-Strapping Pin Requirements

ESP8266 silicon reads the state of GPIO0, GPIO2, and GPIO15 exactly on the rising edge of the reset/power-on line:

```
  GPIO15 | GPIO0 | GPIO2 | Mode                  | Smart Tank Compliance
  -------+-------+-------+-----------------------+------------------------------------------
    LOW  |  HIGH |  HIGH | Flash Boot (SPI EEPROM)| PASS - Normal operating state
    LOW  |  LOW  |  HIGH | UART Download (Flash) | PASS - Only when Flash button (D3) held
    HIGH |   X   |   X   | SDIO Boot (Disabled)  | BLOCKED - Prevented by D8 pulldown load
  -------+-------+-------+-----------------------+------------------------------------------
```

### Risk Assessment & Mitigation Matrix:

1. **GPIO15 (D8 - Pump Active Yellow LED)**:
   - *Failure Mode*: If an indicator circuit pulls GPIO15 to 3.3V, the ESP8266 enters SDIO boot and refuses to execute application code.
   - *Hardware Circuit*: Yellow LED anode $\rightarrow$ $470\,\Omega$ resistor $\rightarrow$ GPIO15. Cathode $\rightarrow$ GND. The resistor and forward voltage of the diode provide a natural pull-down to GND ($< 0.1\,\text{V}$), perfectly matching the bootloader constraint.

2. **GPIO0 (D3 - Setup Recovery Button)**:
   - *Failure Mode*: If pulled LOW, chip waits indefinitely for UART firmware flash.
   - *Hardware Circuit*: Onboard pull-up to 3.3V. Momentary pushbutton to GND. During normal boot, button is open, maintaining HIGH state.

3. **GPIO2 (D4 - Fault Red LED)**:
   - *Failure Mode*: If pulled LOW at boot, chip enters invalid boot mode.
   - *Hardware Circuit*: Connected as Active-LOW. Anode $\rightarrow$ 3.3V rail through $330\,\Omega$ resistor $\rightarrow$ Red LED $\rightarrow$ GPIO2 (D4). At boot, GPIO2 is high impedance/pulled up, LED is OFF, and voltage is HIGH ($\sim 3.3\,\text{V}$).

4. **GPIO12 (D6 - Relay Driver)**:
   - *Glitch Prevention*: In `firmware/src/control/RelayDriver.cpp`, `digitalWrite(PIN_RELAY, HIGH)` is called *before* `pinMode(PIN_RELAY, OUTPUT)`. This prevents the pin from momentarily floating LOW (which would trigger an active-LOW optocoupler relay during boot).

---

## 4. Hardware Verification Notice

> [!WARNING]
> **Compilation Does Not Equal Electrical Validation**:
> Successful PlatformIO compilation (`pio run`) proves syntactic correctness and symbol resolution. It does **NOT** prove that physical wiring conforms to the electrical tolerances.
> 
> **Mandatory Bench Test Steps Before Pump Connection**:
> 1. Disconnect high-voltage / pump power supply.
> 2. Measure voltages on D8, D3, D4, and D6 with a digital multimeter during power cycling.
> 3. Confirm that D8 $\le 0.4\,\text{V}$, D3 $\ge 2.8\,\text{V}$, and D4 $\ge 2.8\,\text{V}$ before the ESP8266 blue LED finishes flashing.
> 4. Verify with an oscilloscope that D6 (Relay) shows zero negative glitches exceeding $10\,\mu\text{s}$ during reset.
