'use client';

import React from 'react';
import { PumpState, ControllerState } from '../types/tank';

interface MetricsGridProps {
  flowRateLpm?: number;
  totalLitres?: number;
  pumpCurrentA?: number;
  rawAdc?: number | string;
  pumpState?: PumpState;
  waterProbe?: boolean;
  controllerStatus?: ControllerState;
}

export default function MetricsGrid({
  flowRateLpm = 0,
  totalLitres = 0,
  pumpCurrentA = 0,
  rawAdc = '--',
  pumpState = 'OFF',
  waterProbe = false,
  controllerStatus = 'Standby',
}: MetricsGridProps) {
  const isPumpRunning = pumpState === 'ON';

  return (
    <div className="grid">
      {/* 1. Flow Rate */}
      <div className="mb">
        <div className="mt">
          <span className="ml">Flow Rate</span>
          <div className="mi ib">💧</div>
        </div>
        <div className="mv">
          <span id="vf">{Number(flowRateLpm || 0).toFixed(1)}</span> <span className="u">L/min</span>
        </div>
        <div className="ms">
          Total: <b id="vt">{Number(totalLitres || 0).toFixed(2)}</b> L
        </div>
      </div>

      {/* 2. Pump Current */}
      <div className="mb">
        <div className="mt">
          <span className="ml">Pump Current</span>
          <div className="mi io">⚡</div>
        </div>
        <div className="mv">
          <span id="vc">{Number(pumpCurrentA || 0).toFixed(2)}</span> <span className="u">A</span>
        </div>
        <div className="ms">
          ACS712 A0 | Raw: <b id="va">{rawAdc ?? '--'}</b>
        </div>
      </div>

      {/* 3. Relay Output */}
      <div className="mb">
        <div className="mt">
          <span className="ml">Relay</span>
          <div className="mi ig">🔌</div>
        </div>
        <div className="mv" style={{ marginTop: '2px' }}>
          <span id="vr" className={`rp ${isPumpRunning ? 'on' : 'off'}`}>
            {isPumpRunning ? 'RUNNING' : 'OFF'}
          </span>
        </div>
        <div className="ms">
          D6 Pin | Probe:{' '}
          <b id="vp">
            {waterProbe ? (
              <span style={{ color: 'var(--red)', fontWeight: 800 }}>DETECTED</span>
            ) : (
              <span style={{ color: 'var(--green)', fontWeight: 800 }}>DRY</span>
            )}
          </b>
        </div>
      </div>

      {/* 4. Autonomous State */}
      <div className="mb">
        <div className="mt">
          <span className="ml">State</span>
          <div className="mi ip">🛡️</div>
        </div>
        <div className="mv" style={{ fontSize: '15px', marginTop: '3px' }} id="vs">
          {controllerStatus || 'Standby'}
        </div>
        <div className="ms">Autonomous Interlock</div>
      </div>
    </div>
  );
}
