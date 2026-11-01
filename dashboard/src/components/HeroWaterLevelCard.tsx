'use client';

import React from 'react';

interface HeroWaterLevelCardProps {
  levelPercent: number;
  distanceCm: number;
}

export default function HeroWaterLevelCard({ levelPercent, distanceCm }: HeroWaterLevelCardProps) {
  const hasValidReading = typeof levelPercent === 'number' && levelPercent >= 0;
  const clampedPercent = hasValidReading ? Math.max(0, Math.min(100, levelPercent)) : 0;
  const displayLevel = hasValidReading ? levelPercent.toFixed(1) : '--';
  const displayDistance =
    typeof distanceCm === 'number' && distanceCm >= 0 ? `${distanceCm.toFixed(1)} cm` : '--';

  return (
    <div className="cd hero">
      <div className="tk">
        <div
          className="tf"
          id="tf"
          style={{
            height: `${clampedPercent}%`,
            transition: 'height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        ></div>
      </div>
      <div className="hd2">
        <span className="hl">Water Level</span>
        <div className="hv">
          <span id="vl">{displayLevel}</span>
          <span className="u">%</span>
        </div>
        <div className="hs">
          Distance: <b id="vd">{displayDistance}</b>
        </div>
        <div className={`tg ${hasValidReading ? 'tg-g' : 'tg-x'}`} id="bs">
          {hasValidReading ? 'Sensor Active' : 'Waiting for telemetry...'}
        </div>
      </div>
    </div>
  );
}
