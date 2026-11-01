'use client';

import React, { useRef, useEffect } from 'react';

interface CurrentGaugeCardProps {
  current?: number;
  peak?: number;
  average?: number;
}

export default function CurrentGaugeCard({
  current = 0,
  peak = 0,
  average = 0,
}: CurrentGaugeCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 104 * dpr;
    canvas.height = 104 * dpr;
    canvas.style.width = '104px';
    canvas.style.height = '104px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = 52;
    const cy = 52;
    const rad = 40;
    const lw = 8;
    const sa = 0.75 * Math.PI;
    const ea = 2.25 * Math.PI;
    const maxA = 5;
    const pct = Math.min((current || 0) / maxA, 1);

    // Inset Dark Track Ring
    ctx.beginPath();
    ctx.arc(cx, cy, rad, sa, ea);
    ctx.strokeStyle = '#191E2C';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Active Glowing Neon Arc
    if (pct > 0) {
      const va = sa + pct * (ea - sa);
      const grd = ctx.createLinearGradient(12, 92, 92, 12);
      if (pct < 0.5) {
        grd.addColorStop(0, '#D4F63D'); // Electric Lime
        grd.addColorStop(1, '#3DF6D9'); // Cyan
      } else if (pct < 0.8) {
        grd.addColorStop(0, '#FFA928'); // Amber
        grd.addColorStop(1, '#D4F63D');
      } else {
        grd.addColorStop(0, '#FF4757'); // Coral Red
        grd.addColorStop(1, '#FFA928');
      }
      ctx.save();
      ctx.shadowColor = pct > 0.8 ? '#FF4757' : '#D4F63D';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, sa, va);
      ctx.strokeStyle = grd;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Numerical Ticks
    ctx.fillStyle = '#6E7688';
    ctx.font = '700 8px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [0, 1, 2, 3, 4, 5].forEach((t) => {
      const a = sa + (t / maxA) * (ea - sa);
      const tx = cx + Math.cos(a) * (rad + 11);
      const ty = cy + Math.sin(a) * (rad + 11);
      ctx.fillText(String(t), tx, ty);
    });
  }, [current]);

  let statusText = 'Idle';
  let statusColor = 'var(--green)';
  if (current > 2) {
    statusText = 'High Load';
    statusColor = 'var(--red)';
  } else if (current > 0.1) {
    statusText = 'Running';
    statusColor = 'var(--orange)';
  }

  return (
    <div className="cd">
      <div className="ch-hd">
        <span className="ch-t">Pump Current Ring</span>
      </div>
      <div className="gauge-wrap">
        <div className="gauge-box">
          <canvas ref={canvasRef} id="cG" width={104} height={104} />
          <div className="gauge-val">
            <div className="gauge-num" id="gn">
              {Number(current || 0).toFixed(2)}
            </div>
            <div className="gauge-unit">Amps</div>
          </div>
        </div>
        <div className="gauge-info">
          <div className="gi-row">
            <span className="gi-label">Peak</span>
            <span className="gi-val" id="gp">
              {Number(peak || 0).toFixed(2)} A
            </span>
          </div>
          <div className="gi-row">
            <span className="gi-label">Average</span>
            <span className="gi-val" id="ga">
              {Number(average || 0).toFixed(2)} A
            </span>
          </div>
          <div className="gi-row">
            <span className="gi-label">Status</span>
            <span className="gi-val" id="gs" style={{ color: statusColor }}>
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
