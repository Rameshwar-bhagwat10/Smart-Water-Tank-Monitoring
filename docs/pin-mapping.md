# Hardware Pin Mapping & Electrical Interfacing Specification
## ESP8266 NodeMCU Provisional Interfacing Guide

> [!CAUTION]
> **Provisional Engineering Baseline**: This pin map and electrical schema is an architectural baseline for design review prior to hardware assembly. **It has NOT been electrically validated on physical circuits or specific module revisions.** All pin assignments, voltage dividers, analog ranges, and driver stages must be physically metered and verified with a digital multimeter (DMM) / oscilloscope before powering physical components.

---

## 1. Provisional Microcontroller Pin Map

| NodeMCU Pin | ESP8266 GPIO | Connected Component & Signal | Direction | Electrical Characteristics | Boot Safety / Strapping Considerations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D1** | `GPIO5` | **HC-SR04 Trigger** | Output | 3.3V logic high trigger pulse ($10\,\mu\text{s}$) | General-purpose I/O. Boot-safe (high impedance during boot). |
| **D2** | `GPIO4` | **HC-SR04 Echo** | Input | **5V TTL shifted to 3.3V** via resistor divider | General-purpose I/O. Boot-safe. Requires level shifting! |
| **D5** | `GPIO14` | **ZJ-S201 Flow Sensor Pulse** | Input | Frequency pulse train with internal pull-up | HSPI SCK. Boot-safe. Verify sensor output voltage ($\le 3.3\text{V}$). |
| **D6** | `GPIO12` | **Relay Driver Input** | Output | Active-HIGH or Active-LOW logic drive | HSPI MISO. Boot-safe. Drives optocoupler/transistor relay stage. |
| **D7** | `GPIO13` | **Piezo Buzzer Driver** | Output | 3.3V PWM or digital toggle via NPN transistor | HSPI MOSI. Boot-safe. Must not draw direct load ($>12\,\text{mA}$). |
| **D0** | `GPIO16` | **Green LED** (System / Wi-Fi OK) | Output | 3.3V active-high through current-limiting resistor | WAKE pin. No pull-up required. Boot-safe for LED indicators. |
| **D8** | `GPIO15` | **Yellow LED** (Pump Active Indicator)| Output | 3.3V active-high through current-limiting resistor | **STRAPPING PIN**: Must be pulled LOW at boot. External load must not hold line HIGH. |
| **TX (D9)** / Alt | `GPIO1` / `GPIO3` | **Red LED** (System Fault / Alarm) | Output | Provisional: Requires dedicated review | **STRAPPING / UART PIN**: TX emits boot ROM debug data. Alternative: I2C I/O expander. |
| **A0** | `ADC0` | **ACS712 Current Sensor Out** | Analog In | 0.0V to 1.0V (bare chip) / 0.0V to 3.3V (NodeMCU internal divider) | Single-channel ADC. Voltage span must be verified against module offset ($2.5\,\text{V}$). |

---

## 2. Boot-Strapping Pins & GPIO Assignment Warnings

The ESP8266 microcontroller employs shared hardware strapping pins that determine chip boot mode (UART download mode vs. SPI Flash execution) during power-on reset:

- **GPIO0 (D3)**: Must be **HIGH** at boot for normal SPI flash operation. If an external sensor, pull-down resistor, or unpowered device pulls this line LOW at power-up, the ESP8266 will hang in bootloader/UART flashing mode. **Do not blindly assign to external loads.**
- **GPIO2 (D4)**: Connected to internal blue LED on ESP-12E. Must be **HIGH** at boot. It floats or outputs debug data momentarily during reset.
- **GPIO15 (D8)**: Must be pulled **LOW** at boot for normal operation. If an external indicator or pull-up forces this pin HIGH during power-on, the chip fails to boot. If used to drive an indicator, ensure it only sinks current to ground or has an active low configuration that does not fight the boot pulldown.
- **GPIO16 (D0)**: Used for deep sleep wake. Does not support hardware interrupts (cannot be used for flow sensor pulses).

---

## 3. Critical Electrical Constraints & Safety Requirements

### A. 3.3V Logic Level Domain
- The ESP8266 microcontroller operates strictly at **3.3V DC**. Its GPIO pins are **NOT 5V tolerant** under long-term reliable operating conditions.
- Applying unconditioned 5V logic signals directly to any ESP8266 input pin risks immediate silicon degradation or catastrophic latch-up.

### B. HC-SR04 Ultrasonic Sensor Voltage Translation
- The standard HC-SR04 ultrasonic sensor requires a **5V VCC supply** for the ultrasonic transmitter transducers to achieve reliable acoustic amplitude and range.
- The `ECHO` output pin outputs a **5V TTL pulse**.
- **Mandatory Level Shifting**: The 5V Echo pulse must be stepped down to 3.3V before entering ESP8266 Pin D2 (`GPIO4`).
  - *Standard Voltage Divider Recommendation*:
    $$V_{out} = V_{in} \times \frac{R_2}{R_1 + R_2}$$
    Using $R_1 = 1.0\,\text{k}\Omega$ (top resistor) and $R_2 = 2.0\,\text{k}\Omega$ (bottom resistor to GND):
    $$V_{out} = 5.0\,\text{V} \times \frac{2000}{1000 + 2000} \approx 3.33\,\text{V}$$
  - Metal film 1% tolerance resistors or a dedicated bi-directional logic level converter (e.g., BSS138-based) must be used.

### C. ZJ-S201 Water Flow Sensor Interfacing
- The ZJ-S201 Hall-effect flow turbine operates typically from 5V to 18V DC.
- When powered from 5V, its open-collector or active push-pull pulse output may output 5V spikes.
- **Verification Rule**: The signal line must be checked on an oscilloscope or DMM. If operating with open-collector, pull up strictly to 3.3V (or use internal ESP8266 pullup on GPIO14). If outputting a driven 5V square wave, implement a resistive divider identical to the HC-SR04 Echo circuit.

### D. ACS712 Current Sensor & A0 Voltage Range Alignment
- The ACS712 Hall-effect current sensor operates at 5V VCC. At zero current ($I = 0\,\text{A}$), its nominal output voltage is:
  $$V_{out(0\text{A})} = \frac{V_{CC}}{2} \approx 2.50\,\text{V}$$
- **NodeMCU A0 Hardware Consideration**:
  - The raw ESP8266 `TOUT` / `ADC0` silicon pin has a **0.0V to 1.0V** input range.
  - Standard NodeMCU development boards incorporate an on-board resistor divider (typically $220\,\text{k}\Omega / 100\,\text{k}\Omega$) that extends the pin's external range to **0.0V to 3.3V**.
  - Because the quiescent voltage is $2.5\,\text{V}$, positive and negative current swings range between $1.5\,\text{V}$ and $3.5\,\text{V}$ (depending on the sensitivity of the $5\text{A}$, $20\text{A}$, or $30\text{A}$ model).
  - An additional external scaling attenuator or operational amplifier buffer may be required to prevent clipping at the upper $3.3\,\text{V}$ limit. **Must be validated during physical hardware calibration.**

### E. Relay Driver & Inductive Kickback Isolation
- The **JQC3F-05VDC-C** is a bare 5V electromechanical relay with a coil resistance of $\sim 70\,\Omega$, drawing approximately $70\,\text{mA}$ when energized.
- **Absolute Limit**: The ESP8266 GPIO pins can source a maximum of only $12\,\text{mA}$. **Never connect a bare relay coil directly to an ESP8266 GPIO pin.**
- **Driver Stage**: An intermediate switching transistor (NPN 2N2222 or MOSFET) or an optocoupler-isolated relay module must be used.
- **Flyback Diode**: A 1N4007 or 1N4148 freewheeling diode must be connected reverse-parallel across the relay coil to safely dissipate inductive back-EMF spikes generated when the coil is de-energized.

### F. High-Current Isolation & Breadboard Restriction
- **NO PUMP CURRENT THROUGH BREADBOARDS**: Solderless breadboard spring clips are rated for signal currents ($< 500\,\text{mA}$). Pumping inductive motors draw several amperes during startup. Routing DC pump motor current through a breadboard causes contact melting, severe voltage sags, and fire hazards.
- The high-current motor circuit (12V DC power source $\rightarrow$ Relay NO contact $\rightarrow$ Pump motor $\rightarrow$ GND return) must be wired using appropriate heavy-gauge copper conductors ($\ge 18\,\text{AWG}$) directly to terminal blocks.
- Electrical grounds must meet in a star-ground topology to prevent motor switching noise from resetting the ESP8266 microcontroller.

---

## 4. Provisional Circuit Schematic Block Diagram

```
           +---------------------------------------------------------+
           |                5V DC Regulated Logic Supply             |
           +----+-------------------+--------------------+-----------+
                |                   |                    |
                | (5V)              | (5V)               | (5V VCC)
                v                   v                    v
         +-------------+     +-------------+     +---------------+
         |   HC-SR04   |     |   ZJ-S201   |     | ACS712 Sensor |
         | Level Sensor|     | Flow Sensor |     |  Hall Current |
         +------+------+     +------+------+     +-------+-------+
       Echo Pin | (5V)     Pulse Pin| (3.3V/5V)   Vout Pin| (2.5V nominal)
                v                   |                    |
        [1k/2k Divider]             v                    v
                | (3.3V)            |                    | (Range Checked)
                v                   |                    |
             D2 (GPIO4)        D5 (GPIO14)            A0 (ADC0)
                |                   |                    |
+---------------+-------------------+--------------------+---------------+
|                          ESP8266 NodeMCU                               |
+---------------+-------------------+--------------------+---------------+
                |                   |                    |
             D1 (GPIO5)        D7 (GPIO13)          D6 (GPIO12)
                |                   |                    |
                v                   v                    v
          HC-SR04 Trig        Piezo Buzzer         Opto-Isolated
          (10us Pulse)         (via NPN)            Relay Module
                                                         |
                                            +------------+------------+
                                            |   JQC3F-05VDC-C Relay   |
                                            +------------+------------+
                                                         |
                                                (Isolated High Current)
                                                         |
                                          +--------------v--------------+
                                          |    12V DC Water Pump Motor  |
                                          |  (Dedicated 12V 3A+ Supply) |
                                          +-----------------------------+
```
