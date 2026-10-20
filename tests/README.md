# Test Suite & Verification Framework

## Overview
This directory coordinates testing strategies, validation scripts, mock payloads, and verification plans for the **Smart Water Tank Monitoring System**.

Reliability and safety are paramount in water resource and pump automation. The testing strategy spans multiple tiers—from pure algorithmic unit tests to physical hardware-in-the-loop validation.

## Multi-Tier Testing Strategy

### 1. Phase 1 & 2 Automated Test Suites (Current & Implemented)
- **Dashboard Unit & Contract Suite** (`tests/dashboard-unit.test.js`):
  - 11 unit tests validating live telemetry parsing, out-of-range value clamping, null uninitialized states, data staleness thresholds (>60s), command payload schema validation, extra field rejection, and UID verification.
  - Command: `npm run test:unit` (from `dashboard/`)
- **Security Rules Evaluation Suite** (`tests/rules-evaluation.test.js`):
  - 19 automated tests evaluating all security scenarios against `database.rules.json` (unauthenticated read/write blocks, role-based authorization for `admin`, `operator`, and `viewer`, immutability of `/live`, `/history`, `/alerts`, and `/access`, anti-deletion, and strict 5-attribute command validation).
  - Command: `npm run test:rules` (from `dashboard/`)
- **Master Test Runner**:
  - Run all 30 tests: `npm test` (from `dashboard/`)

### 2. Algorithmic & Simulation Testing (Phases 3 & 4)
- **Level Calculation**: Unit tests verifying `distanceCm` to `levelPercent` conversion with tank geometry parameters (tank height, dead band offsets, out-of-range clamp).
- **Flow Calculation & Calibration**: Verifying pulse frequency to Litres/min conversion and accumulator precision over time under varying flow rates.
- **Current Calibration & Thresholds**: Verifying ACS712 zero-offset drift compensation, RMS current calculation, and dry-run / stall fault detection algorithms.
- **Pump Failsafe Logic**: Unit tests validating autonomous cutoff when `levelPercent >= 95%`, timer cutoff when `runtime >= maxRuntimeSec`, and rejection of unsafe commands.

### 3. Cloud Integration & Security Testing (Phases 2 & 3)
- **Database Rules Testing**: Automated rule unit tests ensuring unauthenticated clients cannot read/write telemetry, and only verified device identities can write sensor nodes.
- **Command Acknowledgment Handshake**: Validating state transitions (`pending` → `acknowledged` → `executed` / `rejected`) and ensuring UI decouples requested vs. confirmed states.
- **Network Resilience**: Testing ESP8266 Wi-Fi dropout, intermittent disconnects, Firebase reconnect backoff, and local safety operation during cloud blackouts.

### 4. Hardware Integration Testing (Phase 5)
- **Electrical Signal Integrity**: Logic level verification (3.3V vs 5V), voltage divider validation on HC-SR04 Echo pin, ADC scaling for ACS712.
- **Actuation & Inrush Current**: Relay switching under motor inductive loads, flyback protection, and physical safety cutoffs.
- **Physical Tank Calibration**: Real water level measurement against physical tape measure, flow meter volume accuracy against calibrated container.

## Detailed Plan Reference
A complete breakdown of test cases, execution steps, expected outcomes, and readiness requirements is documented in:
- [testing-plan.md](file:///d:/projects/Smart%20Water%20Tank/docs/testing-plan.md)
- [firebase-testing.md](file:///d:/projects/Smart%20Water%20Tank/docs/firebase-testing.md)
