/**
 * Smart Water Tank Monitoring System — Unit Test Suite
 * Stage F: Deterministic Sensor Calculation & Calibration Verification
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Pure mathematical equivalents of C++ Firmware Sensor Engines ---

function calculateWaterLevel(measuredDistanceCm, emptyDistanceCm, fullDistanceCm) {
  if (emptyDistanceCm <= fullDistanceCm) {
    return { valid: false, levelPercent: 0.0, error: 'INVALID_CALIBRATION' };
  }
  if (measuredDistanceCm <= 0 || measuredDistanceCm > 400.0) {
    return { valid: false, levelPercent: 0.0, error: 'OUT_OF_BOUNDS' };
  }

  const rawPercent = 100.0 * (emptyDistanceCm - measuredDistanceCm) / (emptyDistanceCm - fullDistanceCm);
  let clampedPercent = rawPercent;
  if (clampedPercent < 0.0) clampedPercent = 0.0;
  if (clampedPercent > 100.0) clampedPercent = 100.0;

  return { valid: true, levelPercent: Number(clampedPercent.toFixed(1)) };
}

function calculateFlow(pulsesInWindow, windowDurationMs, pulsesPerLitre) {
  if (pulsesPerLitre <= 0 || windowDurationMs <= 0) {
    return { valid: false, flowRateLpm: 0.0, error: 'INVALID_PARAM' };
  }
  const deltaSeconds = windowDurationMs / 1000.0;
  const pulseFreqHz = pulsesInWindow / deltaSeconds;
  const flowRateLpm = (pulseFreqHz * 60.0) / pulsesPerLitre;
  return { valid: true, flowRateLpm: Number(flowRateLpm.toFixed(1)) };
}

function calculateCumulativeVolume(cumulativePulses, pulsesPerLitre) {
  if (pulsesPerLitre <= 0) return 0.0;
  return Number((cumulativePulses / pulsesPerLitre).toFixed(2));
}

function calculateCurrent(adcSample, adcZeroOffset, adcMaxVoltage, sensitivityVperA, adcResolution = 1023) {
  if (sensitivityVperA <= 0 || adcResolution <= 0) {
    return { valid: false, currentAmps: 0.0, error: 'INVALID_PARAM' };
  }
  const measuredV = (adcSample / adcResolution) * adcMaxVoltage;
  const zeroV = (adcZeroOffset / adcResolution) * adcMaxVoltage;
  const deltaV = Math.abs(measuredV - zeroV);
  let amps = deltaV / sensitivityVperA;

  // Noise deadband
  if (amps < 0.05) amps = 0.0;

  return { valid: true, currentAmps: Number(amps.toFixed(2)) };
}

describe('Sensor Calculations & Calibration Engine', () => {

  describe('Ultrasonic Distance to Level Percentage', () => {
    const EMPTY_CM = 200.0;
    const FULL_CM = 20.0;

    it('accurately calculates 0% level at empty tank distance', () => {
      const res = calculateWaterLevel(200.0, EMPTY_CM, FULL_CM);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.levelPercent, 0.0);
    });

    it('accurately calculates 100% level at full tank distance', () => {
      const res = calculateWaterLevel(20.0, EMPTY_CM, FULL_CM);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.levelPercent, 100.0);
    });

    it('accurately calculates 50% level at midpoint distance', () => {
      const midpoint = FULL_CM + (EMPTY_CM - FULL_CM) / 2; // 110.0 cm
      const res = calculateWaterLevel(midpoint, EMPTY_CM, FULL_CM);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.levelPercent, 50.0);
    });

    it('clamps levels above 100% if distance is closer than full reference', () => {
      const res = calculateWaterLevel(15.0, EMPTY_CM, FULL_CM);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.levelPercent, 100.0);
    });

    it('clamps levels below 0% if distance is beyond empty reference', () => {
      const res = calculateWaterLevel(220.0, EMPTY_CM, FULL_CM);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.levelPercent, 0.0);
    });

    it('rejects physically impossible or timed-out readings (<=0 cm or >400 cm)', () => {
      const timeoutRes = calculateWaterLevel(0, EMPTY_CM, FULL_CM);
      assert.strictEqual(timeoutRes.valid, false);
      assert.strictEqual(timeoutRes.error, 'OUT_OF_BOUNDS');

      const extremeRes = calculateWaterLevel(450.0, EMPTY_CM, FULL_CM);
      assert.strictEqual(extremeRes.valid, false);
      assert.strictEqual(extremeRes.error, 'OUT_OF_BOUNDS');
    });

    it('fails closed when configuration is reversed or invalid (empty <= full)', () => {
      const reversedRes = calculateWaterLevel(50.0, 20.0, 200.0);
      assert.strictEqual(reversedRes.valid, false);
      assert.strictEqual(reversedRes.error, 'INVALID_CALIBRATION');

      const equalRes = calculateWaterLevel(50.0, 100.0, 100.0);
      assert.strictEqual(equalRes.valid, false);
      assert.strictEqual(equalRes.error, 'INVALID_CALIBRATION');
    });
  });

  describe('Flow Sensor Frequency & Volume Math', () => {
    const PULSES_PER_LITRE = 450.0; // 7.5 Hz per L/min

    it('reports 0 L/min when zero pulses are detected in sample window', () => {
      const res = calculateFlow(0, 1000, PULSES_PER_LITRE);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.flowRateLpm, 0.0);
    });

    it('accurately calculates flow rate for known pulse frequency', () => {
      // 75 pulses in 1 second = 75 Hz -> 75 * 60 / 450 = 10.0 L/min
      const res = calculateFlow(75, 1000, PULSES_PER_LITRE);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.flowRateLpm, 10.0);
    });

    it('handles fractional sample windows correctly', () => {
      // 37.5 pulses in 500ms = 75 Hz -> 10.0 L/min
      const res = calculateFlow(37.5, 500, PULSES_PER_LITRE);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.flowRateLpm, 10.0);
    });

    it('accurately computes cumulative total volume in litres', () => {
      const vol1 = calculateCumulativeVolume(450, PULSES_PER_LITRE);
      assert.strictEqual(vol1, 1.00);

      const vol2 = calculateCumulativeVolume(4500, PULSES_PER_LITRE);
      assert.strictEqual(vol2, 10.00);

      const vol3 = calculateCumulativeVolume(1125, PULSES_PER_LITRE);
      assert.strictEqual(vol3, 2.50);
    });
  });

  describe('ACS712 Current Sensing & Zero-Offset Calibration', () => {
    const ADC_MAX_VOLTS = 3.3;
    const SENSITIVITY = 0.185; // 185 mV/A (5A model)
    const ZERO_OFFSET_ADC = 512; // Nominal midpoint for bidirectional sensor

    it('reports zero current when reading matches calibrated zero offset', () => {
      const res = calculateCurrent(512, ZERO_OFFSET_ADC, ADC_MAX_VOLTS, SENSITIVITY);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.currentAmps, 0.0);
    });

    it('applies noise deadband for negligible sensor drift (<0.05 A)', () => {
      // ADC drift of 1 bit: 513 vs 512 = 3.2mV / 0.185 = 0.017 A -> below deadband
      const res = calculateCurrent(513, ZERO_OFFSET_ADC, ADC_MAX_VOLTS, SENSITIVITY);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.currentAmps, 0.0);
    });

    it('accurately measures positive current above deadband', () => {
      // Delta = 50 ADC counts -> (50 / 1023) * 3.3V = 0.1613V -> 0.1613 / 0.185 = 0.87A
      const res = calculateCurrent(562, ZERO_OFFSET_ADC, ADC_MAX_VOLTS, SENSITIVITY);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.currentAmps, 0.87);
    });

    it('handles symmetrical AC/DC negative deviation identically', () => {
      const res = calculateCurrent(462, ZERO_OFFSET_ADC, ADC_MAX_VOLTS, SENSITIVITY);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.currentAmps, 0.87);
    });
  });

  describe('ACS712 Current Sensing with External Voltage Divider Attenuation', () => {
    const ADC_MAX_VOLTS = 3.3;
    const SENSITIVITY = 0.185; // 185 mV/A (5A model)
    const DIVIDER_RATIO = 18.0 / (10.0 + 18.0); // 0.642857 (10k upper, 18k lower)
    // At zero current, sensor outputs 2.50V. Through divider, voltage at A0 = 2.50 * 0.642857 = 1.6071V.
    // ADC count = (1.6071 / 3.3) * 1023 ≈ 498 counts.
    const ZERO_OFFSET_ADC = Math.round((2.50 * DIVIDER_RATIO / ADC_MAX_VOLTS) * 1023); // ~498

    function calculateCurrentWithDivider(adcSample, zeroAdc, dividerRatio = DIVIDER_RATIO) {
      const vAdc = (adcSample / 1023) * ADC_MAX_VOLTS;
      const vZero = (zeroAdc / 1023) * ADC_MAX_VOLTS;
      const vSensor = vAdc / dividerRatio;
      const vSensorZero = vZero / dividerRatio;
      const deltaV = Math.abs(vSensor - vSensorZero);
      let amps = deltaV / SENSITIVITY;
      if (amps < 0.08) amps = 0.0;
      return { valid: true, currentAmps: Number(amps.toFixed(2)) };
    }

    it('reports zero current at calibrated quiescent offset with external divider', () => {
      const res = calculateCurrentWithDivider(ZERO_OFFSET_ADC, ZERO_OFFSET_ADC);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.currentAmps, 0.0);
    });

    it('accurately reconstructs sensor voltage and current under 2A load with divider', () => {
      // At 2.0A: sensor output = 2.50 + (2.0 * 0.185) = 2.87V
      // At A0 = 2.87 * (18 / 28) = 1.845V
      // ADC count = (1.845 / 3.3) * 1023 ≈ 572 counts
      const res = calculateCurrentWithDivider(572, ZERO_OFFSET_ADC);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(Math.abs(res.currentAmps - 2.0) <= 0.05, true);
    });

    it('detects motor running when current exceeds threshold (e.g. 0.2A)', () => {
      const resIdle = calculateCurrentWithDivider(ZERO_OFFSET_ADC, ZERO_OFFSET_ADC);
      const isMotorRunningIdle = resIdle.currentAmps >= 0.2;
      assert.strictEqual(isMotorRunningIdle, false);

      const resRunning = calculateCurrentWithDivider(572, ZERO_OFFSET_ADC);
      const isMotorRunningActive = resRunning.currentAmps >= 0.2;
      assert.strictEqual(isMotorRunningActive, true);
    });
  });

  describe('Flow Sensor Plausibility & Overflow Protection', () => {
    const PULSES_PER_LITRE = 450.0;
    const MAX_PLAUSIBLE_LPM = 60.0;

    function checkFlowPlausibility(flowRateLpm) {
      return flowRateLpm >= 0.0 && flowRateLpm <= MAX_PLAUSIBLE_LPM;
    }

    it('accepts normal domestic flow rates (e.g. 15 L/min)', () => {
      assert.strictEqual(checkFlowPlausibility(15.0), true);
    });

    it('rejects physically impossible flow rates (e.g. >60 L/min for 1/2-inch pipe)', () => {
      assert.strictEqual(checkFlowPlausibility(85.0), false);
      assert.strictEqual(checkFlowPlausibility(-2.0), false);
    });
  });
});
