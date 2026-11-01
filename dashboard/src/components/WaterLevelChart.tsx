'use client';

import React, { useRef, useEffect } from 'react';

interface WaterLevelChartProps {
  history?: number[];
  currentLevel?: number;
}

export default function WaterLevelChart({
  history = [],
  currentLevel = -1,
}: WaterLevelChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = 120;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { t: 10, b: 22, l: 30, r: 10 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;

    // Ultra-subtle dark gridlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ch * (i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#6E7688';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ['100', '75', '50', '25', '0'].forEach((v, i) => {
      ctx.fillText(v, pad.l - 6, pad.t + ch * (i / 4) + 3);
    });

    if (history.length === 0) return;

    const data = history.length === 1 ? [history[0], history[0]] : history;
    const pts = data.map((v, i) => ({
      x: pad.l + (i / (data.length - 1)) * cw,
      y: pad.t + ch * (1 - Math.max(0, Math.min(100, v)) / 100),
    }));

    // Glowing Neon Gradient Area Fill
    const grd = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
    grd.addColorStop(0, 'rgba(212, 246, 61, 0.28)');
    grd.addColorStop(0.7, 'rgba(212, 246, 61, 0.06)');
    grd.addColorStop(1, 'rgba(212, 246, 61, 0.00)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, h - pad.b);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h - pad.b);
    ctx.closePath();
    ctx.fillStyle = grd;
    ctx.fill();

    // Vibrant Electric Lime Neon Curve
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#D4F63D';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Terminal Point with Neon Halo
    const lp = pts[pts.length - 1];
    ctx.save();
    ctx.shadowColor = '#D4F63D';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#D4F63D';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#090B10';
    ctx.fill();
  }, [history]);

  const displayLevel = currentLevel >= 0 ? `${currentLevel.toFixed(1)} %` : '-- %';

  return (
    <div className="cd ch-wrap">
      <div className="ch-hd">
        <span className="ch-t">Water Level Trend</span>
        <span className="ch-v" id="ch-lv">
          {displayLevel}
        </span>
      </div>
      <canvas ref={canvasRef} id="cL" height={120} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}
