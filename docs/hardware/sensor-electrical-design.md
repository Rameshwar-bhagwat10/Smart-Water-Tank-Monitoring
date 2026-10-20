# Sensor Electrical Interface & Signal Conditioning Design

**Document Reference**: `docs/hardware/sensor-electrical-design.md`  
**Audit Findings Addressed**: `HW-002` (High / P1) — ACS712 Overvoltage on A0 & `HW-003` (High / P1) — 5V Flow Sensor on 3.3V GPIO14  
**Target Hardware**: NodeMCU v2 (ESP8266), HC-SR04, ZJ-S201 / YF-S201, ACS712ELCTR-05B-T  
**Status**: ELECTRICAL DESIGN SPECIFICATION — PENDING BENCH METERING  

---

## 1. Executive Summary

The ESP8266 microcontroller operates strictly within a **3.3V DC logic and analog domain**. Connecting standard 5V-powered sensors directly to ESP8266 inputs without signal conditioning introduces two severe risks:
1. **Silicon Overvoltage Degradation**: The HC-SR04 ultrasonic sensor and Hall-effect flow sensor output 5V square waves. Injecting 5V into 3.3V GPIO pins (D2/GPIO4 and D5/GPIO14) violates ESP8266 maximum electrical ratings ($V_{IH(\text{max})} \approx 3.6\,\text{V}$) and risks substrate diode breakdown.
2. **Analog ADC Saturation (`HW-002`)**: The ACS712 current sensor operates from a 5V rail and outputs a quiescent zero-current voltage of $2.50\,\text{V}$. Under motor startup or inductive current surges, its output climbs between $3.0\,\text{V}$ and $4.5\,\text{V}$. Because the NodeMCU A0 pin has a maximum full-scale range of **3.3V** (due to its internal $220\,\text{k}\Omega / 100\,\text{k}\Omega$ divider over the bare $1.0\,\text{V}$ `TOUT` pin), any sensor voltage above 3.3V saturates the ADC at count 1023, clipping peak current readings and exposing the ADC to overvoltage stress.

This document specifies the exact resistor dividers, level-shifting topologies, calibration equations, and safe verification procedures.

---

## 2. ACS712 Hall-Effect Current Sensor Conditioning (`HW-002`)

### 2.1 Sensor Electrical Characteristics
- **Assumed Installed Module**: Allegro **ACS712ELCTR-05B-T** (5 Amp bidirectional version).
  *(Note: If 20A or 30A variants are used, sensitivity changes as noted below).*
- **Supply Voltage ($V_{CC}$)**: $5.00\,\text{V} \pm 5\%$ regulated DC.
- **Sensitivity ($S$)**:
  - 5A Model: $185\,\text{mV/A}$ ($0.185\,\text{V/A}$)
  - 20A Model: $100\,\text{mV/A}$ ($0.100\,\text{V/A}$)
  - 30A Model: $66\,\text{mV/A}$ ($0.066\,\text{V/A}$)
- **Quiescent Output Voltage ($V_{IOUT(Q)}$)**:
  $$V_{out(0\text{A})} = \frac{V_{CC}}{2} = \frac{5.00\,\text{V}}{2} = 2.50\,\text{V}$$
- **Full-Scale Output Span (5A Variant)**:
  - At $+5\,\text{A}$ DC: $V_{out} = 2.50\,\text{V} + (5 \times 0.185\,\text{V}) = 3.425\,\text{V}$
  - At $-5\,\text{A}$ DC / Peak Inrush: $V_{out} = 2.50\,\text{V} - (5 \times 0.185\,\text{V}) = 1.575\,\text{V}$
  - Motor stall/startup peak ($\sim 8\,\text{A}$ transient): $V_{out} \approx 2.50\,\text{V} + 1.48\,\text{V} = 3.98\,\text{V}$!

### 2.2 NodeMCU A0 Input Range Limitation
- Bare ESP8266 `TOUT` (Pin 6) silicon rating: **$0.0\,\text{V} \text{ to } 1.0\,\text{V}$**.
- NodeMCU development boards integrate an on-board resistor divider:
  - Top Resistor ($R_{board1}$): $220\,\text{k}\Omega$
  - Bottom Resistor ($R_{board2}$): $100\,\text{k}\Omega$
  - Scaling Ratio: $\frac{100}{220 + 100} = \frac{100}{320} = 0.3125$
  - Resulting External A0 Terminal Full-Scale Range: $1.0\,\text{V} / 0.3125 = \mathbf{3.20\,\text{V} \text{ to } 3.30\,\text{V}}$.
- **The Defect**: An output of $3.425\,\text{V}$ (or $3.98\,\text{V}$ transient) directly applied to A0 exceeds 3.3V, causing ADC saturation at 1023 counts.

### 2.3 Required External Signal Conditioning Circuit

To scale the full $0.0\,\text{V} - 5.0\,\text{V}$ ACS712 output safely into the NodeMCU's $0.0\,\text{V} - 3.3\,\text{V}$ linear window, an external passive precision voltage divider is required:

```
ACS712 Vout (0 to 5.0V)
      |
     [ ] R_ext1 = 10.0 kΩ (1% Metal Film)
      |
      +----------> NodeMCU A0 Pin (0 to 3.12V)
      |
     [ ] R_ext2 = 18.0 kΩ (or 20.0 kΩ 1% Metal Film)
      |
     GND
```

#### Calculation with $R_{ext1} = 10.0\,\text{k}\Omega$ and $R_{ext2} = 18.0\,\text{k}\Omega$:
$$\text{Divider Attenuation Ratio } K_{div} = \frac{R_{ext2}}{R_{ext1} + R_{ext2}} = \frac{18.0}{10.0 + 18.0} = \frac{18}{28} \approx 0.6428$$
- Quiescent voltage ($I = 0\,\text{A}$, $V_{sensor} = 2.50\,\text{V}$):
  $$V_{A0(0\text{A})} = 2.50\,\text{V} \times 0.6428 = \mathbf{1.607\,\text{V}}$$
- Maximum current ($I = +5\,\text{A}$, $V_{sensor} = 3.425\,\text{V}$):
  $$V_{A0(5\text{A})} = 3.425\,\text{V} \times 0.6428 = \mathbf{2.202\,\text{V}}$$
- Extreme overcurrent ($I = +8\,\text{A}$ stall, $V_{sensor} = 3.98\,\text{V}$):
  $$V_{A0(8\text{A})} = 3.98\,\text{V} \times 0.6428 = \mathbf{2.558\,\text{V}}$$
- Worst-case rail fault ($V_{sensor} = 5.00\,\text{V}$):
  $$V_{A0(\text{max})} = 5.00\,\text{V} \times 0.6428 = \mathbf{3.214\,\text{V}} \le 3.30\,\text{V}$$
*(Zero risk of ADC overvoltage saturation or pin damage!)*

### 2.4 Firmware Conversion Formula
In `firmware/src/sensors/CurrentSensor.cpp`:
$$\text{Measured Voltage at Pin } V_{A0} = \frac{\text{ADC Counts}}{1023.0} \times 3.30\,\text{V}$$
$$\text{Actual Sensor } V_{out} = \frac{V_{A0}}{K_{div}} = V_{A0} \times \frac{R_{ext1} + R_{ext2}}{R_{ext2}} = V_{A0} \times 1.5555$$
$$\text{Current } I\,(\text{Amperes}) = \frac{V_{out} - V_{quiescent\_calibrated}}{\text{Sensitivity}\,(\text{V/A})}$$

---

## 3. ZJ-S201 / YF-S201 Water Flow Sensor Conditioning (`HW-003`)

### 3.1 Sensor Electrical Characteristics
- **Working Range**: $1.0 \text{ to } 30.0\,\text{L/min}$.
- **Operating Voltage**: $4.5\,\text{V} \text{ to } 15.0\,\text{V}$ DC (Powered from the 5V logic rail).
- **Output Waveform**: 5V periodic square wave with $50\% \pm 10\%$ duty cycle.
- **Output Stage**: NPN Open-Collector with internal pull-up to 5V, or active push-pull 5V TTL driver depending on module clone.

### 3.2 Required Level Shifting Circuit
Direct connection to ESP8266 `D5` (`GPIO14`) violates 3.3V GPIO ratings. A standard two-resistor voltage divider safely converts the 5V pulse train to 3.3V:

```
Flow Sensor Yellow Pulse Wire (5V Square Wave)
      |
     [ ] R1 = 1.0 kΩ (1% Metal Film)
      |
      +----------> ESP8266 Pin D5 (GPIO14) [3.33V Logic Pulse]
      |
     [ ] R2 = 2.0 kΩ (1% Metal Film)
      |
     GND
```

$$V_{GPIO14} = 5.0\,\text{V} \times \frac{2000\,\Omega}{1000\,\Omega + 2000\,\Omega} = 5.0\,\text{V} \times \frac{2}{3} = \mathbf{3.33\,\text{V}}$$

### 3.3 Pulse Calculation & Calibration Formula
- **Manufacturer Nominal Factor**:
  $$f\,(\text{Hz}) = 7.5 \times Q\,(\text{L/min})$$
  $$\text{Flow Rate } Q = \frac{f}{7.5} = \frac{\text{Pulses Per Second}}{7.5}$$
- **Nominal Pulses per Litre**:
  $$\text{Pulses Per Litre} = 7.5 \times 60 = \mathbf{450 \text{ pulses/L}}$$
- **Calibration Procedure (Wet Bucket Test)**:
  1. Fill a calibrated 10.0-Litre container using the water pump.
  2. Record the total hardware interrupt pulse counter accumulated by `flowSensor.getPulses()`.
  3. Calculate calibrated factor: $K_{cal} = \frac{\text{Total Pulses}}{10.0\,\text{L}}$.
  4. Update `DEFAULT_PULSES_PER_LITRE` in `firmware/src/config/AppConfig.h`.

---

## 4. HC-SR04 Ultrasonic Water Level Sensor Conditioning

### 4.1 Sensor Electrical Characteristics
- **Operating Voltage**: $5.0\,\text{V}$ DC (Ultrasonic acoustic transducers require 5V to generate sufficient acoustic energy).
- **Trigger Pin (D1 / GPIO5)**: Driven directly by ESP8266 3.3V logic. (The HC-SR04 input trigger threshold is $V_{IH} \approx 2.0\,\text{V}$, so a 3.3V pulse reliably triggers the device).
- **Echo Pin (D2 / GPIO4)**: Sensor outputs a $5.0\,\text{V}$ pulse whose high-duration $t_{echo}$ represents acoustic time-of-flight.

### 4.2 Required Level Shifting Circuit
The Echo pin requires an identical $1.0\,\text{k}\Omega / 2.0\,\text{k}\Omega$ divider:

```
HC-SR04 Echo Pin (5V Pulse)
      |
     [ ] R1 = 1.0 kΩ (1% Metal Film, 1/4W)
      |
      +----------> ESP8266 Pin D2 (GPIO4) [3.33V Logic Pulse]
      |
     [ ] R2 = 2.0 kΩ (1% Metal Film, 1/4W)
      |
     GND
```

### 4.3 Water Level Calculation
$$\text{Distance to Water Surface } D\,(\text{cm}) = \frac{t_{echo}\,(\mu\text{s}) \times 0.0343\,\text{cm}/\mu\text{s}}{2}$$
$$\text{Water Height in Tank } H_{water} = D_{empty} - D$$
$$\text{Level Percentage } P = \left(\frac{D_{empty} - D}{D_{empty} - D_{full}}\right) \times 100\%$$
- Filtered in `firmware/src/sensors/UltrasonicSensor.cpp` using a running median of 5 samples to reject acoustic reflection noise and surface ripples.

---

## 5. Resistor Bill of Materials (BOM) & Power Ratings

| Component | Function | Value | Tolerance | Power Rating | Package |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **R1, R3** | HC-SR04 & Flow Sensor Dividers (Upper) | $1.0\,\text{k}\Omega$ | $\pm 1\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R2, R4** | HC-SR04 & Flow Sensor Dividers (Lower) | $2.0\,\text{k}\Omega$ | $\pm 1\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R5** | ACS712 Attenuator (Upper) | $10.0\,\text{k}\Omega$ | $\pm 1\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R6** | ACS712 Attenuator (Lower) | $18.0\,\text{k}\Omega$ | $\pm 1\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R7** | Red LED Current Limiter (D4 / GPIO2) | $330\,\Omega$ | $\pm 5\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R8** | Yellow LED Current Limiter (D8 / GPIO15)| $470\,\Omega$ | $\pm 5\%$ | $0.25\,\text{W}$ | Axial / 0805 |
| **R9** | Green LED Current Limiter (D0 / GPIO16) | $330\,\Omega$ | $\pm 5\%$ | $0.25\,\text{W}$ | Axial / 0805 |

---

## 6. Safe Bench Test Procedure Before Connecting Microcontroller

1. **Power Supply Metering**:
   - Energize 5V DC power supply without NodeMCU plugged in.
   - Verify with a calibrated DMM that the 5V rail measures between $4.95\,\text{V}$ and $5.10\,\text{V}$.
2. **Divider Test (HC-SR04 Echo)**:
   - Provide 5V to HC-SR04. Trigger with 3.3V pulse generator or momentary pulse.
   - Measure voltage at node between $1\,\text{k}\Omega$ and $2\,\text{k}\Omega$ resistors on an oscilloscope. Confirm pulse amplitude never exceeds $3.4\,\text{V}$.
3. **Divider Test (Flow Sensor)**:
   - Blow gently into flow sensor turbine.
   - Measure voltage on the divider center tap. Confirm pulses alternate strictly between $0\,\text{V}$ and $3.3\,\text{V}$.
4. **ACS712 Quiescent Output Verification**:
   - Power ACS712 with 5V. With zero load current, measure divider output node to A0.
   - Confirm measured voltage is approximately $1.60\,\text{V} \pm 0.05\,\text{V}$.
