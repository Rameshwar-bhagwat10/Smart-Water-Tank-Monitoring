'use client';

import React from 'react';
import { ControlMode, PumpState } from '../types/tank';

interface ControlModeCardProps {
  mode?: ControlMode;
  pumpState?: PumpState;
  levelPercent?: number;
  waterProbe?: boolean;
  statusText?: string;
  syncLatency?: string;
  onSetMode: (mode: ControlMode) => void;
  onSetPump: (state: PumpState) => void;
}

export default function ControlModeCard({
  mode = 'AUTO',
  pumpState = 'OFF',
  levelPercent = -1,
  waterProbe = false,
  statusText = '',
  syncLatency = 'Cloud RTDB',
  onSetMode,
  onSetPump,
}: ControlModeCardProps) {
  const isAuto = mode === 'AUTO';
  const isPumpRunning = pumpState === 'ON';

  // Compute descriptive status display
  let computedStatus = statusText;
  if (!computedStatus) {
    if (isAuto) {
      if (levelPercent >= 95.0 && waterProbe) {
        computedStatus = 'Auto: Tank FULL (Pump Idle)';
      } else if (isPumpRunning) {
        computedStatus = 'Auto: Pump RUNNING (Filling)';
      } else if (levelPercent >= 0 && levelPercent <= 20.0) {
        computedStatus = 'Auto: Tank LOW (Auto-Start)';
      } else {
        computedStatus = 'Auto: Standby';
      }
    } else {
      computedStatus = isPumpRunning ? 'Manual: Pump RUNNING' : 'Manual: Pump STOPPED';
    }
  }

  return (
    <div className="cd">
      <div className="st">Control Mode</div>
      <div className="seg">
        <button
          className={`sb ${isAuto ? 'a' : ''}`}
          id="ba"
          onClick={() => onSetMode('AUTO')}
          type="button"
        >
          Automatic
        </button>
        <button
          className={`sb ${!isAuto ? 'a' : ''}`}
          id="bm"
          onClick={() => onSetMode('MANUAL')}
          type="button"
        >
          Manual
        </button>
      </div>

      <div className="ag">
        <button
          className="ab bs"
          id="as"
          type="button"
          disabled={isAuto}
          style={{
            opacity: isAuto ? 0.65 : 1,
            boxShadow: !isAuto && isPumpRunning ? '0 0 16px rgba(212, 246, 61, 0.6)' : 'none',
            cursor: isAuto ? 'not-allowed' : 'pointer',
          }}
          onClick={() => onSetPump('ON')}
        >
          ⚡ Start
        </button>
        <button
          className="ab bp"
          id="ap"
          type="button"
          disabled={isAuto}
          style={{
            opacity: isAuto ? 0.65 : 1,
            boxShadow: !isAuto && !isPumpRunning ? '0 0 16px rgba(255, 71, 87, 0.5)' : 'none',
            cursor: isAuto ? 'not-allowed' : 'pointer',
          }}
          onClick={() => onSetPump('OFF')}
        >
          🛑 Stop
        </button>
      </div>

      <div className="fr">
        <span>
          Status: <b id="ak">{computedStatus}</b>
        </span>
        <span
          id="st"
          style={{
            fontSize: '10px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-sec)',
          }}
        >
          {syncLatency}
        </span>
      </div>
    </div>
  );
}
