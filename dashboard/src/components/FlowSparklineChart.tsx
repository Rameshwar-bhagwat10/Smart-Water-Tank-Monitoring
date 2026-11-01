'use client';

import React, { useRef, useEffect } from 'react';

const MAX_POINTS = 60;

interface FlowSparklineChartProps {
  history?: number[];
  currentFlow?: number;
}

export default function FlowSparklineChart({
  history = [],
  currentFlow = 0,
}: FlowSparklineChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = 80;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const pad = { t: 8, b: 8, l: 6, r: 6 };
    const cw = w - pad.l - pad.r;
    const ch = h - pad.t - pad.b;

    if (history.length === 0) return;

    const data = history.length === 1 ? [history[0], history[0]] : history;
    const mx = Math.max(...data, 0.5);

    const pts = data.map((v, i) => ({
      x: pad.l + (i / (data.length - 1)) * cw,
      y: pad.t + ch * (1 - v / mx),
    }));

    // Kalo-style Vertical Bars with Rounded Caps
    const bw = Math.max(3, cw / MAX_POINTS - 1.5);
    data.forEach((v, i) => {
      const bh = Math.max(2, (v / mx) * ch);
      const bx = pad.l + (i / (data.length - 1)) * cw - bw / 2;
      ctx.fillStyle = v > 0.05 ? 'rgba(212, 246, 61, 0.28)' : 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      if (typeof (ctx as unknown as { roundRect?: Function }).roundRect === 'function') {
        (ctx as unknown as { roundRect: Function }).roundRect(bx, h - pad.b - bh, bw, bh, [2, 2, 0, 0]);
      } else {
        ctx.rect(bx, h - pad.b - bh, bw, bh);
      }
      ctx.fill();
    });

    // Neon Cyan Sparkline Overlay
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#3DF6D9';
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    const lp = pts[pts.length - 1];
    ctx.save();
    ctx.shadowColor = '#3DF6D9';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#3DF6D9';
    ctx.fill();
    ctx.restore();
  }, [history]);

  return (
    <div className="cd ch-wrap">
      <div className="ch-hd">
        <span className="ch-t">Flow Rate Sparkline</span>
        <span className="ch-v" id="ch-fv">
          {Number(currentFlow || 0).toFixed(1)} L/min
        </span>
      </div>
      <canvas ref={canvasRef} id="cF" height={80} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}
