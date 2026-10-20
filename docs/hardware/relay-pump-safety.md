# Relay Driver, Pump Electrical Protection & Inductive Isolation Specification

**Document Reference**: `docs/hardware/relay-pump-safety.md`  
**Audit Finding Addressed**: `HW-004` (High / P1) — Inductive Kickback, Relay Isolation & Power Domain Separation  
**Target Hardware**: 5V Optocoupler Relay Module (SRD-05VDC-SL-C), 12V DC Water Pump, NodeMCU ESP8266  
**Status**: ELECTRICAL SAFETY SPECIFICATION — PHYSICAL TESTING PENDING BENCH BUILD  

---

## 1. Executive Summary & HW-004 Scope

Electromechanical water pumps are high-inductance electrical loads. When the pump motor is switched OFF, the collapsing magnetic field in the motor windings generates an inductive back-electromotive force (back-EMF) transient spike of hundreds of volts. Without adequate isolation, this inductive energy couples back into the DC power rails, causing ESP8266 brownout resets, flash memory corruption, or catastrophic transistor breakdown.

Furthermore, driving a relay directly from microcontroller I/O pins exceeds ESP8266 current sourcing limits ($12\,\text{mA}$ max per pin, whereas a 5V relay coil draws $\sim 70\,\text{mA}$).

This specification documents the required optocoupler isolation topology, JD-VCC jumper configuration, inductive flyback snubbers, power supply separation, and safe firmware state machine sequencing.

---

## 2. Relay Module Electrical Analysis

### 2.1 Target Module Specification
- **Relay Type**: Songle **SRD-05VDC-SL-C** Single-Pole Double-Throw (SPDT) electromechanical relay mounted on a standard breakout board with driver stage.
- **Coil Nominal Voltage**: $5.0\,\text{V}$ DC.
- **Coil Resistance**: $\approx 70\,\Omega$.
- **Coil Operating Current**:
  $$I_{coil} = \frac{5.0\,\text{V}}{70\,\Omega} \approx 71.4\,\text{mA}$$
- **Contact Ratings**:
  - $10\,\text{A} @ 250\,\text{V}$ AC (Mains — **STRICTLY PROHIBITED IN PHASE 4A**)
  - $10\,\text{A} @ 30\,\text{V}$ DC (Low-Voltage DC Motor circuit)

### 2.2 Built-In Module Driver Components
Standard single-channel 5V relay modules incorporate:
1. **EL817 Optocoupler**: Provides galvanic isolation between the microcontroller GPIO signal and the relay coil transistor.
2. **SS8050 NPN Transistor (or equivalent)**: Switches the $71.4\,\text{mA}$ coil current.
3. **1N4148 Coil Flyback Diode**: Connected reverse-parallel directly across the relay coil terminals to suppress the relay coil's own turn-off transient.
4. **Status LEDs**: Red (Power indicator) and Green (Relay energized indicator).

### 2.3 Optocoupler Drive Polarity: Active-LOW
- In `firmware/src/config/AppConfig.h`, `RELAY_ACTIVE_LOW = true`.
- Anode of the EL817 internal infrared LED is tied through an onboard resistor to the module's `VCC` pin ($3.3\,\text{V}$ or $5\,\text{V}$).
- The cathode is connected to the `IN` pin (Pin `D6` / `GPIO12` on NodeMCU).
- **Driving GPIO12 LOW** (0V) completes the circuit, energizing the optocoupler and actuating the relay (**Pump ON**).
- **Driving GPIO12 HIGH** (3.3V) equalizes potential across the IR LED, turning off the optocoupler (**Pump OFF**).

---

## 3. Optical Isolation & The JD-VCC Jumper

Most multi-channel and single-channel relay modules include a 3-pin jumper block labeled **`VCC - JD-VCC - GND`**:

```
           FACTORY DEFAULT: JUMPER ON                 RECOMMENDED: TRUE OPTICAL ISOLATION
          +---------------+                         +---------------+
          | VCC   JD-VCC  | (Jumpered)              | VCC   JD-VCC  | (Jumper Removed!)
          +-------+-------+                         +-------+-------+
                  |                                     |       |
            Shared 5V Rail                              |       +--> Dedicated 5V Relay Supply
          (Causes Reset on Switch)                      +----------> NodeMCU 3.3V Logic Rail
```

### 3.1 Why Factory Jumper Must Be Removed
When the jumper connects `VCC` and `JD-VCC`, the relay coil shares the same power trace as the logic supply. The instant the relay coil energizes, its sudden $71.4\,\text{mA}$ current draw causes a momentary voltage dip on the logic rail, frequently triggering an ESP8266 Brownout Reset (BOR).

### 3.2 True Galvanic Isolation Wiring Guide
1. **Remove the JD-VCC shorting jumper**.
2. Connect `VCC` on the relay input header to **ESP8266 3.3V pin** (powers only the low-current EL817 LED, $\sim 2\,\text{mA}$).
3. Connect `IN` to **ESP8266 D6 (`GPIO12`)**.
4. **DO NOT** connect the input header `GND` to ESP8266 GND (this preserves optical isolation).
5. Connect `JD-VCC` on the jumper header to the **external 5V DC supply positive terminal**.
6. Connect the relay board power `GND` to the **external 5V supply negative terminal**.

---

## 4. DC Pump Inductive Kickback Protection (External Snubber)

While the relay module protects itself from its *own* internal coil spike via its 1N4148 diode, the module provides **ZERO protection against inductive kickback from the external DC water pump motor**!

### 4.1 Pump Electrical Characteristics
- **Type**: 12V DC Diaphragm or Submersible Water Pump.
- **Continuous Operating Current**: $1.5\,\text{A} \text{ to } 3.0\,\text{A}$.
- **Startup Inrush / Stall Current**: $5.0\,\text{A} \text{ to } 8.0\,\text{A}$.
- **Inductance ($L$)**: $\sim 5 \text{ to } 50\,\text{mH}$.
- **Turn-Off Back-EMF**:
  $$V_{spike} = -L \frac{di}{dt}$$
  When relay contacts open rapidly ($dt \approx 10\,\mu\text{s}$), switching off a $3\,\text{A}$ motor can generate negative spikes exceeding **$150\,\text{V}$**, causing contact arcing and severe EMI broadcast.

### 4.2 Mandatory Motor Flyback Diode
An external fast-recovery or high-current rectifier diode must be wired **directly across the pump motor terminals** (as physically close to the motor as possible):

```
       +12V DC Supply
             |
             +-----------------------+
             |                       |
        Relay [COM]                  |
        Relay [NO] (Normally Open)   |
             |                       |
             +---------+             |
                       |             |
                   +---+-------------+---+
                   |   +             -   |
                   |      DC PUMP        |
                   |      MOTOR          |
                   |                     |
                   |   Cathode    Anode  |
                   |   (Striped)         |
                   |      +---|<|---+    |
                   |   1N5408 / 1N4007   |
                   +---------------------+
                                     |
                                     v
                                12V DC GND
```

#### Diode Requirements:
- **Part Number**: **1N5408** ($3\,\text{A}$ continuous, $200\,\text{A}$ peak surge, $1000\,\text{V}$) or **1N4007** ($1\,\text{A}$ continuous).
- **Polarity**:
  - **Cathode (silver stripe)** connects to the pump **Positive (+)** wire.
  - **Anode** connects to the pump **Negative (- / Ground)** wire.
- **Function**: During normal running, the diode is reverse-biased and draws zero current. When relay contacts open, the motor inductance forces current forward through the diode in a safe closed loop, safely dissipating the stored magnetic energy in the winding resistance.

---

## 5. Firmware Safe State Machine & Boot Sequencing

Firmware safeguards implemented in `firmware/src/control/RelayDriver.cpp` and `PumpController.cpp`:

1. **Pre-Latched Safe Output**:
   ```cpp
   // Set pin HIGH (de-energized for Active-LOW) BEFORE enabling output driver
   digitalWrite(_pin, _activeLow ? HIGH : LOW);
   pinMode(_pin, OUTPUT);
   digitalWrite(_pin, _activeLow ? HIGH : LOW);
   ```
2. **Pre-Activation High-Level Cutoff Check (`SAF-001`)**:
   In `PumpController::requestManualPump(true)`:
   - If water level is $\ge 95\%$, command is immediately rejected before touching the relay driver.
   - Eliminates relay contact chatter and pump short-cycling on full tanks.
3. **Anti-Chatter Minimum Switching Interval**:
   - `MIN_SWITCHING_INTERVAL_MS = 5000` (5 seconds). Prevents rapid relay toggling that could weld mechanical contacts.
4. **Independent Fail-Safe**:
   - All safety lockouts (High Level Cutoff, Maximum 20-minute Runtime, Dry-Run Protection, Sensor Faults) run in the local C++ loop independent of Wi-Fi or Firebase connectivity.

---

## 6. Physical Wiring & Safety Rules

> [!CAUTION]
> **ABSOLUTE PROHIBITIONS FOR PHASE 4A**:
> 1. **NO MAINS AC VOLTAGE**: Never connect 110V/230V AC mains to the relay module in this testing phase. All bench verification must use a 12V DC bench power supply or dummy LED load.
> 2. **NO MOTOR CURRENT THROUGH BREADBOARDS**: Solderless breadboards are rated for $\le 500\,\text{mA}$. Routing 3A–8A pump current through breadboard clips causes melting, resistance heating, and fire hazards. Use terminal blocks and $\ge 18\,\text{AWG}$ stranded copper wire for all pump power connections.
> 3. **STAR GROUNDING**: Microcontroller logic ground and 12V pump power ground must only meet at a single physical point (star point) at the power supply to prevent motor ground currents from lifting the ESP8266 ground plane.
