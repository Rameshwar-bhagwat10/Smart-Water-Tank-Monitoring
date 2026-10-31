#include "LocalDashboardServer.h"
#include "LocalDashboardGzip.h"

namespace SmartTank {

static const IPAddress LOCAL_AP_IP(192, 168, 4, 1);
static const uint16_t LOCAL_DNS_PORT = 53;

// High-Speed, Self-Contained Embedded Dashboard with Interactive Charts (PROGMEM, 0 external dependencies)
static const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Smart Water Tank</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' fill='%23D4F63D'/%3E%3C/svg%3E">
<style>
:root {
  --bg: #090B10;
  --card: #131722;
  --card-inner: #191E2C;
  --border: rgba(255, 255, 255, 0.08);
  --separator: rgba(255, 255, 255, 0.06);
  --text: #FFFFFF;
  --text-sec: #8A92A6;
  --text-muted: #525A6C;
  --accent: #D4F63D;
  --accent-hover: #E2FC5B;
  --accent-dark: #090B10;
  --accent-glow: rgba(212, 246, 61, 0.3);
  --accent-soft: rgba(212, 246, 61, 0.12);
  --water-cyan: #3DF6D9;
  --water-blue: #007AFF;
  --green: #D4F63D;
  --green-soft: rgba(212, 246, 61, 0.14);
  --orange: #FFA928;
  --red: #FF4757;
  --purple: #AF52DE;
  --r-lg: 20px;
  --r-pill: 9999px;
  --shadow: 0 16px 36px -10px rgba(0, 0, 0, 0.6);
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", sans-serif; -webkit-tap-highlight-color: transparent; }
body { background: var(--bg); color: var(--text); padding: 18px 14px 42px; display: flex; justify-content: center; min-height: 100vh; position: relative; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
body::before { content: ''; position: fixed; top: -140px; left: 50%; transform: translateX(-50%); width: 500px; height: 350px; background: radial-gradient(ellipse at center, rgba(212, 246, 61, 0.08) 0%, transparent 70%); pointer-events: none; z-index: 0; }
.ct { max-width: 440px; width: 100%; display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; }

/* Header */
.hd { display: flex; justify-content: space-between; align-items: center; padding: 4px 2px; }
.hd-brand { display: flex; align-items: center; gap: 10px; }
.hd-icon { width: 34px; height: 34px; border-radius: 11px; background: var(--card); border: 1px solid rgba(212, 246, 61, 0.3); display: flex; align-items: center; justify-content: center; color: var(--accent); box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.hd-t { font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: #FFFFFF; }
.hd-b { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(212, 246, 61, 0.25); box-shadow: 0 0 12px rgba(212, 246, 61, 0.15); }
.dp { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: dp 1.6s infinite; }
@keyframes dp { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.75)} }

/* Card */
.cd { background: var(--card); border-radius: var(--r-lg); padding: 18px; border: 1px solid var(--border); box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05); position: relative; overflow: hidden; }

/* Hero Water Tank */
.hero { display: flex; align-items: center; gap: 20px; padding: 20px; background: linear-gradient(145deg, #151926 0%, #11141F 100%); }
.tk { width: 68px; height: 126px; background: #10131C; border-radius: 18px; border: 1.5px solid rgba(255,255,255,0.09); position: relative; overflow: hidden; display: flex; flex-direction: column-reverse; box-shadow: inset 0 3px 10px rgba(0,0,0,0.7), 0 4px 14px rgba(0,0,0,0.4); flex-shrink: 0; }
.tk::before { content: ''; position: absolute; top: 8px; bottom: 8px; right: 4px; width: 5px; background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.25) 0, rgba(255,255,255,0.25) 1px, transparent 1px, transparent 12px); z-index: 2; pointer-events: none; }
.tf { width: 100%; height: 0%; background: linear-gradient(180deg, var(--water-cyan) 0%, var(--water-blue) 100%); transition: height 0.6s cubic-bezier(0.34, 1.4, 0.64, 1); position: relative; box-shadow: 0 0 16px rgba(61, 246, 217, 0.4); }
.tf::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #FFFFFF; box-shadow: 0 0 8px #FFFFFF; }
.hd2 { display: flex; flex-direction: column; flex: 1; }
.hl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-sec); }
.hv { font-size: 48px; font-weight: 800; letter-spacing: -1.5px; line-height: 1; margin: 6px 0 6px; font-variant-numeric: tabular-nums; color: #FFFFFF; }
.hv .u { font-size: 22px; font-weight: 700; color: var(--accent); margin-left: 3px; }
.hs { font-size: 13px; color: var(--text-sec); font-weight: 500; }
.hs b { color: #FFFFFF; font-weight: 700; }
.tg { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: var(--r-pill); width: fit-content; margin-top: 8px; }
.tg-g { background: var(--green-soft); color: var(--green); border: 1px solid rgba(212, 246, 61, 0.25); }
.tg-x { background: var(--card-inner); color: var(--text-muted); border: 1px solid var(--border); }

/* Chart Cards */
.ch-wrap { position: relative; }
.ch-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.ch-t { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-sec); }
.ch-v { font-size: 13px; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; background: var(--accent-soft); padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid rgba(212, 246, 61, 0.2); }
canvas { width: 100% !important; border-radius: 12px; display: block; }

/* 2x2 Grid */
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mb { background: var(--card); border-radius: var(--r-lg); padding: 14px 14px 12px; border: 1px solid var(--border); box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 5px; }
.mt { display: flex; justify-content: space-between; align-items: center; }
.mi { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; border: 1px solid var(--border); }
.ib { background: rgba(0, 122, 255, 0.12); color: #5AC8FA; border-color: rgba(0, 122, 255, 0.25); }
.io { background: rgba(212, 246, 61, 0.12); color: var(--accent); border-color: rgba(212, 246, 61, 0.25); }
.ig { background: rgba(52, 199, 89, 0.12); color: #34C759; border-color: rgba(52, 199, 89, 0.25); }
.ip { background: rgba(175, 82, 222, 0.12); color: #AF52DE; border-color: rgba(175, 82, 222, 0.25); }
.ml { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-sec); }
.mv { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; color: #FFFFFF; }
.mv .u { font-size: 12px; font-weight: 600; color: var(--text-sec); margin-left: 1px; }
.ms { font-size: 11px; color: var(--text-sec); font-weight: 500; }
.ms b { color: #FFFFFF; }

/* Relay Pill */
.rp { display: inline-block; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: var(--r-pill); letter-spacing: 0.4px; }
.rp.on { background: var(--accent); color: var(--accent-dark); box-shadow: 0 0 16px rgba(212, 246, 61, 0.4); }
.rp.off { background: var(--card-inner); color: var(--text-muted); border: 1px solid var(--border); }

/* Gauge */
.gauge-wrap { display: flex; align-items: center; gap: 18px; }
.gauge-box { position: relative; width: 104px; height: 104px; flex-shrink: 0; }
.gauge-box canvas { width: 104px !important; height: 104px !important; }
.gauge-val { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
.gauge-num { font-size: 22px; font-weight: 800; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; color: #FFFFFF; }
.gauge-unit { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-sec); }
.gauge-info { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.gi-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; padding: 4px 0; border-bottom: 1px solid var(--separator); }
.gi-row:last-child { border-bottom: none; }
.gi-label { color: var(--text-sec); font-weight: 500; }
.gi-val { font-weight: 700; font-variant-numeric: tabular-nums; color: #FFFFFF; }

/* Controls */
.st { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-sec); margin-bottom: 10px; }
.seg { display: flex; background: var(--card-inner); border-radius: var(--r-pill); padding: 4px; border: 1px solid var(--border); }
.sb { flex: 1; border: none; background: transparent; padding: 9px 12px; font-size: 13px; font-weight: 700; color: var(--text-sec); border-radius: var(--r-pill); cursor: pointer; transition: all 0.22s; }
.sb.a { background: var(--accent); color: var(--accent-dark); box-shadow: 0 2px 14px rgba(212, 246, 61, 0.35); }
.ag { display: flex; gap: 10px; margin-top: 14px; }
.ab { flex: 1; height: 48px; font-size: 14.5px; font-weight: 800; letter-spacing: -0.2px; border: none; border-radius: var(--r-pill); cursor: pointer; transition: all 0.18s; display: flex; align-items: center; justify-content: center; gap: 6px; }
.ab:active { transform: scale(0.97); }
.ab:disabled { opacity: 0.25; cursor: not-allowed; transform: none; box-shadow: none; }
.bs { background: var(--accent); color: var(--accent-dark); box-shadow: 0 4px 20px rgba(212, 246, 61, 0.35); }
.bp { background: var(--red); color: #FFFFFF; box-shadow: 0 4px 20px rgba(255, 71, 87, 0.35); }
.fr { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--separator); font-size: 11.5px; color: var(--text-sec); }
.fr b { color: #FFFFFF; }

/* Timeline */
.tl { display: flex; flex-direction: column; gap: 0; }
.tl-item { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; position: relative; }
.tl-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; box-shadow: 0 0 8px currentColor; }
.tl-line { position: absolute; left: 3.5px; top: 20px; bottom: -6px; width: 1px; background: var(--separator); }
.tl-item:last-child .tl-line { display: none; }
.tl-body { flex: 1; }
.tl-msg { font-size: 12.5px; font-weight: 600; color: #FFFFFF; }
.tl-time { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; font-variant-numeric: tabular-nums; }

/* Footer */
.fl { background: var(--card); border-radius: var(--r-lg); border: 1px solid var(--border); box-shadow: var(--shadow); overflow: hidden; }
.fl-r { display: flex; justify-content: space-between; align-items: center; padding: 11px 16px; font-size: 12px; color: var(--text-sec); border-bottom: 1px solid var(--separator); }
.fl-r:last-child { border-bottom: none; }
.fl-r b { color: #FFFFFF; font-weight: 600; font-family: monospace; font-size: 11.5px; }
</style>
</head>
<body>
<div class="ct">

  <!-- Header -->
  <div class="hd">
    <div class="hd-brand">
      <div class="hd-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <div class="hd-t">Water Tank</div>
    </div>
    <div class="hd-b" id="hd-mode"><span class="dp"></span> Local AP</div>
  </div>

  <!-- Hero Water Tank Card -->
  <div class="cd hero">
    <div class="tk"><div class="tf" id="tf" style="height:0%"></div></div>
    <div class="hd2">
      <span class="hl">Water Level</span>
      <div class="hv"><span id="vl">--</span><span class="u">%</span></div>
      <div class="hs">Distance: <b id="vd">-- cm</b></div>
      <div class="tg tg-x" id="bs">Standby</div>
    </div>
  </div>

  <!-- Water Level History Chart -->
  <div class="cd ch-wrap">
    <div class="ch-hd">
      <span class="ch-t">Water Level Trend</span>
      <span class="ch-v" id="ch-lv">-- %</span>
    </div>
    <canvas id="cL" height="120"></canvas>
  </div>

  <!-- 2x2 Metrics -->
  <div class="grid">
    <div class="mb">
      <div class="mt"><span class="ml">Flow Rate</span><div class="mi ib">💧</div></div>
      <div class="mv"><span id="vf">0.0</span> <span class="u">L/min</span></div>
      <div class="ms">Total: <b id="vt">0.00</b> L</div>
    </div>
    <div class="mb">
      <div class="mt"><span class="ml">Pump Current</span><div class="mi io">⚡</div></div>
      <div class="mv"><span id="vc">0.00</span> <span class="u">A</span></div>
      <div class="ms">ACS712 A0 | Raw: <b id="va">--</b></div>
    </div>
    <div class="mb">
      <div class="mt"><span class="ml">Relay</span><div class="mi ig">🔌</div></div>
      <div class="mv" style="margin-top:2px"><span id="vr" class="rp off">OFF</span></div>
      <div class="ms">D6 Pin | Probe: <b id="vp">DRY</b></div>
    </div>
    <div class="mb">
      <div class="mt"><span class="ml">State</span><div class="mi ip">🛡️</div></div>
      <div class="mv" style="font-size:15px;margin-top:3px" id="vs">IDLE</div>
      <div class="ms">Autonomous Interlock</div>
    </div>
  </div>

  <!-- Flow Sparkline Chart -->
  <div class="cd ch-wrap">
    <div class="ch-hd">
      <span class="ch-t">Flow Rate Sparkline</span>
      <span class="ch-v" id="ch-fv">0.0 L/min</span>
    </div>
    <canvas id="cF" height="80"></canvas>
  </div>

  <!-- Current Gauge + Stats -->
  <div class="cd">
    <div class="ch-hd"><span class="ch-t">Pump Current Ring</span></div>
    <div class="gauge-wrap">
      <div class="gauge-box">
        <canvas id="cG" width="104" height="104"></canvas>
        <div class="gauge-val">
          <div class="gauge-num" id="gn">0.00</div>
          <div class="gauge-unit">Amps</div>
        </div>
      </div>
      <div class="gauge-info">
        <div class="gi-row"><span class="gi-label">Peak</span><span class="gi-val" id="gp">0.00 A</span></div>
        <div class="gi-row"><span class="gi-label">Average</span><span class="gi-val" id="ga">0.00 A</span></div>
        <div class="gi-row"><span class="gi-label">Status</span><span class="gi-val" id="gs" style="color:var(--green)">Idle</span></div>
      </div>
    </div>
  </div>

  <!-- Controls -->
  <div class="cd">
    <div class="st">Control Mode</div>
    <div class="seg">
      <button class="sb a" id="ba" onclick="sM('AUTO')">Automatic</button>
      <button class="sb" id="bm" onclick="sM('MANUAL')">Manual</button>
    </div>
    <div class="ag">
      <button class="ab bs" id="as" onclick="sP('ON')">⚡ Start</button>
      <button class="ab bp" id="ap" onclick="sP('OFF')">🛑 Stop</button>
    </div>
    <div class="fr">
      <span>Status: <b id="ak">Standby</b></span>
      <span id="st" style="font-size:10px;font-family:monospace">Ready</span>
    </div>
  </div>

  <!-- Activity Timeline -->
  <div class="cd">
    <div class="ch-hd"><span class="ch-t">Activity Log</span><span class="ch-v" id="tl-ct">0 events</span></div>
    <div class="tl" id="tl"></div>
  </div>

  <!-- Footer -->
  <div class="fl">
    <div class="fl-r"><span>Channel</span><b>📡 Local AP</b></div>
    <div class="fl-r"><span>SSID</span><b>SmartWaterTank</b></div>
    <div class="fl-r"><span>IP</span><b>192.168.4.1</b></div>
    <div class="fl-r"><span>Hotspot Wi-Fi</span><b id="wf-st">Checking...</b></div>
    <div class="fl-r"><span>Uptime</span><b id="vu">--</b></div>
    <div class="fl-r"><span>Refresh</span><b>600ms</b></div>
  </div>

</div>

<script>
// -- Data history buffers (zero dummy data; dynamically populated from real sensors) --
const MX=60;
const lH=[];
const fH=[];
const cH=[];
let cM='MANUAL',iS=false,pC=0.0,cS=0.0,cN=0,lastPump='OFF',lastState='IDLE';
const evts=[];

// -- Canvas setup helpers with instant width fallback --
function dpr(){return window.devicePixelRatio||1;}
function initC(id,h){
  const c=document.getElementById(id);
  if(!c)return null;
  const r=dpr();
  let pw=c.parentElement?c.parentElement.clientWidth:0;
  if(!pw||pw<40){pw=Math.min(window.innerWidth-32,440);}
  c.width=pw*r;
  c.height=h*r;
  c.style.height=h+'px';
  const x=c.getContext('2d');
  x.scale(r,r);
  return{c,x,w:pw,h};
}

// -- Draw Level Chart (Monex Neon Area + Line) --
function drawLevel(){
  const ctx=initC('cL',120);
  if(!ctx)return;
  const{x,w,h}=ctx;
  const pad={t:10,b:22,l:30,r:10};
  const cw=w-pad.l-pad.r, ch=h-pad.t-pad.b;
  // Subtle dark grid
  x.strokeStyle='rgba(255,255,255,0.05)';x.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=pad.t+ch*(i/4);
    x.beginPath();x.moveTo(pad.l,y);x.lineTo(w-pad.r,y);x.stroke();
  }
  // Y labels
  x.fillStyle='#6E7688';x.font='600 9px -apple-system,sans-serif';x.textAlign='right';
  ['100','75','50','25','0'].forEach((v,i)=>{x.fillText(v,pad.l-6,pad.t+ch*(i/4)+3);});
  if(lH.length===0)return;

  const data=lH.length===1?[lH[0],lH[0]]:lH;
  const pts=data.map((v,i)=>({
    x:pad.l+(i/(data.length-1))*cw,
    y:pad.t+ch*(1-Math.max(0,Math.min(100,v))/100)
  }));
  // Gradient fill
  const grd=x.createLinearGradient(0,pad.t,0,h-pad.b);
  grd.addColorStop(0,'rgba(212,246,61,0.28)');
  grd.addColorStop(0.7,'rgba(212,246,61,0.06)');
  grd.addColorStop(1,'rgba(212,246,61,0.00)');
  x.beginPath();x.moveTo(pts[0].x,h-pad.b);
  pts.forEach(p=>x.lineTo(p.x,p.y));
  x.lineTo(pts[pts.length-1].x,h-pad.b);x.closePath();x.fillStyle=grd;x.fill();
  // Neon Line
  x.beginPath();pts.forEach((p,i)=>{i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});
  x.strokeStyle='#D4F63D';x.lineWidth=2.5;x.lineJoin='round';x.lineCap='round';x.stroke();
  // Dot with glowing halo
  const lp=pts[pts.length-1];
  x.save();x.shadowColor='#D4F63D';x.shadowBlur=12;
  x.beginPath();x.arc(lp.x,lp.y,4.5,0,Math.PI*2);x.fillStyle='#D4F63D';x.fill();
  x.restore();
  x.beginPath();x.arc(lp.x,lp.y,2,0,Math.PI*2);x.fillStyle='#090B10';x.fill();
}

// -- Draw Flow Sparkline (Kalo Rounded Bars + Cyan Line) --
function drawFlow(){
  const ctx=initC('cF',80);
  if(!ctx)return;
  const{x,w,h}=ctx;
  const pad={t:8,b:8,l:6,r:6};
  const cw=w-pad.l-pad.r, ch=h-pad.t-pad.b;
  if(fH.length===0)return;

  const data=fH.length===1?[fH[0],fH[0]]:fH;
  const mx=Math.max(...data,0.5);
  const pts=data.map((v,i)=>({
    x:pad.l+(i/(data.length-1))*cw,
    y:pad.t+ch*(1-v/mx)
  }));
  const bw=Math.max(3,cw/MX-1.5);
  data.forEach((v,i)=>{
    const bh=Math.max(2,(v/mx)*ch);
    const bx=pad.l+(i/(data.length-1))*cw-bw/2;
    x.fillStyle=v>0.05?'rgba(212,246,61,0.28)':'rgba(255,255,255,0.04)';
    x.beginPath();
    if(x.roundRect){x.roundRect(bx,h-pad.b-bh,bw,bh,[2,2,0,0]);}
    else{x.rect(bx,h-pad.b-bh,bw,bh);}
    x.fill();
  });
  // Cyan Line
  x.beginPath();pts.forEach((p,i)=>{i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});
  x.strokeStyle='#3DF6D9';x.lineWidth=1.8;x.lineJoin='round';x.lineCap='round';x.stroke();
  const lp=pts[pts.length-1];
  x.save();x.shadowColor='#3DF6D9';x.shadowBlur=8;
  x.beginPath();x.arc(lp.x,lp.y,3.5,0,Math.PI*2);x.fillStyle='#3DF6D9';x.fill();
  x.restore();
}

// -- Draw Current Gauge (Kalo Circular Progress Ring) --
function drawGauge(val){
  const c=document.getElementById('cG');
  if(!c)return;
  const r=dpr();c.width=104*r;c.height=104*r;
  c.style.width='104px';c.style.height='104px';
  const x=c.getContext('2d');x.scale(r,r);
  const cx=52,cy=52,rad=40,lw=8;
  const sa=0.75*Math.PI, ea=2.25*Math.PI;
  const maxA=5;
  const pct=Math.min(val/maxA,1);
  // Track
  x.beginPath();x.arc(cx,cy,rad,sa,ea);x.strokeStyle='#191E2C';x.lineWidth=lw;x.lineCap='round';x.stroke();
  // Active arc
  if(pct>0){
    const va=sa+pct*(ea-sa);
    const grd=x.createLinearGradient(12,92,92,12);
    if(pct<0.5){grd.addColorStop(0,'#D4F63D');grd.addColorStop(1,'#3DF6D9');}
    else if(pct<0.8){grd.addColorStop(0,'#FFA928');grd.addColorStop(1,'#D4F63D');}
    else{grd.addColorStop(0,'#FF4757');grd.addColorStop(1,'#FFA928');}
    x.save();
    x.shadowColor=pct>0.8?'#FF4757':'#D4F63D';x.shadowBlur=10;
    x.beginPath();x.arc(cx,cy,rad,sa,va);x.strokeStyle=grd;x.lineWidth=lw;x.lineCap='round';x.stroke();
    x.restore();
  }
  // Ticks
  x.fillStyle='#6E7688';x.font='700 8px -apple-system,sans-serif';x.textAlign='center';x.textBaseline='middle';
  [0,1,2,3,4,5].forEach((t)=>{
    const a=sa+(t/maxA)*(ea-sa);
    const tx=cx+Math.cos(a)*(rad+11);
    const ty=cy+Math.sin(a)*(rad+11);
    x.fillText(t,tx,ty);
  });
}

// -- Timeline --
function addEvt(msg,color){
  const now=new Date();
  const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  evts.unshift({msg,color,ts});
  if(evts.length>8)evts.pop();
  renderTL();
}
function renderTL(){
  const el=document.getElementById('tl');
  document.getElementById('tl-ct').innerText=evts.length+' events';
  if(!evts.length){el.innerHTML='<div style="font-size:12px;color:var(--text-sec);padding:8px 0">No events yet</div>';return;}
  el.innerHTML=evts.map((e,i)=>'<div class="tl-item"><div class="tl-dot" style="background:'+e.color+'"></div>'+(i<evts.length-1?'<div class="tl-line"></div>':'')+'<div class="tl-body"><div class="tl-msg">'+e.msg+'</div><div class="tl-time">'+e.ts+'</div></div></div>').join('');
}

// -- Format uptime --
function fmtUp(s){
  if(s<60)return s+'s';
  if(s<3600)return Math.floor(s/60)+'m '+s%60+'s';
  return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m';
}

// -- Fetch Telemetry --
async function poll(){
  if(iS)return;
  try{
    const res=await fetch('/api/live');
    if(!res.ok)return;
    const d=await res.json();

    // Water Level
    const sb=document.getElementById('bs');
    if(d.sensorConnected&&d.level>=0){
      const lv=d.level.toFixed(1);
      document.getElementById('vl').innerText=lv;
      document.getElementById('tf').style.height=Math.max(0,Math.min(100,d.level))+'%';
      document.getElementById('vd').innerText=d.distance.toFixed(1)+' cm';
      sb.innerText='Sensor Active';sb.className='tg tg-g';
      lH.push(d.level);if(lH.length>MX)lH.shift();
      document.getElementById('ch-lv').innerText=lv+' %';
    } else {
      document.getElementById('vl').innerText='--';
      document.getElementById('tf').style.height='0%';
      document.getElementById('vd').innerText='--';
      sb.innerText='Sensor Standby';sb.className='tg tg-x';
      lH.push(0);if(lH.length>MX)lH.shift();
      document.getElementById('ch-lv').innerText='-- %';
    }

    // Flow
    const fv=(d.flow!==undefined&&d.flow>=0)?d.flow:0;
    document.getElementById('vf').innerText=fv.toFixed(1);
    document.getElementById('vt').innerText=(d.total||0).toFixed(2);
    fH.push(fv);if(fH.length>MX)fH.shift();
    document.getElementById('ch-fv').innerText=fv.toFixed(1)+' L/min';

    // Current
    const cv=(d.current!==undefined&&d.current>=0)?d.current:0;
    document.getElementById('vc').innerText=cv.toFixed(2);
    cH.push(cv);if(cH.length>MX)cH.shift();
    if(cv>pC)pC=cv;
    cS+=cv;cN++;
    document.getElementById('gn').innerText=cv.toFixed(2);
    document.getElementById('gp').innerText=pC.toFixed(2)+' A';
    document.getElementById('ga').innerText=(cN?cS/cN:0).toFixed(2)+' A';
    const gsEl=document.getElementById('gs');
    if(cv>2){gsEl.innerText='High Load';gsEl.style.color='var(--red)';}
    else if(cv>0.1){gsEl.innerText='Running';gsEl.style.color='var(--orange)';}
    else{gsEl.innerText='Idle';gsEl.style.color='var(--green)';}
    drawGauge(cv);

    // Water Probe DO & Raw ADC
    const vp=document.getElementById('vp');
    if(vp){
      vp.innerHTML=d.waterProbe?'<span style="color:var(--red)">DETECTED</span>':'<span style="color:var(--green)">DRY</span>';
    }
    const va=document.getElementById('va');
    if(va&&d.rawAdc!==undefined){va.innerText=d.rawAdc;}

    // Relay
    const rp=document.getElementById('vr');
    if(d.pump==='ON'){rp.innerText='RUNNING';rp.className='rp on';}
    else{rp.innerText='OFF';rp.className='rp off';}

    // State & Uptime
    document.getElementById('vs').innerText=d.status||'Standby';
    document.getElementById('vu').innerText=fmtUp(d.uptime||0);

    // Wi-Fi Status badge
    const wf=document.getElementById('wf-st');
    if(wf){
      if(d.wifi){
        wf.innerHTML='<span style="color:#D4F63D">&#9679; Online ('+(d.ip||'')+')</span>';
        const hm=document.getElementById('hd-mode');
        if(hm)hm.innerHTML='<span class="dp"></span> Cloud + Local';
      }else{
        wf.innerHTML='<span style="color:#8A92A6">&#9675; Offline (Local Only)</span>';
        const hm=document.getElementById('hd-mode');
        if(hm)hm.innerHTML='<span class="dp" style="background:#FFA928;box-shadow:0 0 8px #FFA928"></span> Local Only';
      }
    }

    // Mode & Button State Sync
    cM=d.mode||'AUTO';
    uMB(cM,d.pump);

    // Timeline events
    if(lastPump!==d.pump){
      if(d.pump==='ON')addEvt('Pump started','#D4F63D');
      else if(lastPump==='ON')addEvt('Pump stopped','#FF4757');
      lastPump=d.pump;
    }
    const st=d.status||'Standby';
    if(lastState!==st&&lastState!==''){
      addEvt('State → '+st,st==='Normal'||st==='IDLE'||st==='AUTO_FILLING'||st==='MANUAL_FILLING'?'#D4F63D':'#FFA928');
    }
    lastState=st;

    // Draw charts
    drawLevel();drawFlow();
  }catch(e){}
}

function uMB(m,p){
  const a=(m==='AUTO');
  document.getElementById('ba').className='sb'+(a?' a':'');
  document.getElementById('bm').className='sb'+(!a?' a':'');
  const as=document.getElementById('as');
  const ap=document.getElementById('ap');
  if(a){
    as.style.opacity='0.65';
    ap.style.opacity='0.65';
    as.style.boxShadow='none';
    ap.style.boxShadow='none';
    document.getElementById('ak').innerText='Auto Control Active';
  } else {
    as.style.opacity='1';
    ap.style.opacity='1';
    if(p==='ON'||lastPump==='ON'){
      as.style.boxShadow='0 0 16px rgba(212,246,61,0.6)';
      ap.style.boxShadow='none';
      document.getElementById('ak').innerText='Manual: Pump RUNNING';
    } else {
      as.style.boxShadow='none';
      ap.style.boxShadow='0 0 16px rgba(255,71,87,0.5)';
      document.getElementById('ak').innerText='Manual: Pump STOPPED';
    }
  }
}

async function sM(m){
  iS=true;
  document.getElementById('ak').innerText='Setting '+m+'...';
  cM=m;uMB(m,lastPump);
  try{
    const t=performance.now();
    const r=await fetch('/api/command?mode='+encodeURIComponent(m));
    const d=await r.json();
    const ms=Math.round(performance.now()-t);
    document.getElementById('st').innerText='Switched '+ms+'ms';
    cM=d.mode||m;lastPump=d.pump;uMB(cM,d.pump);addEvt('Mode → '+cM,'#AF52DE');poll();
  }catch(e){document.getElementById('ak').innerText='Error';}
  finally{iS=false;}
}

async function sP(s){
  iS=true;
  document.getElementById('ak').innerText='Pump '+s+'...';
  // Instant optimistic feedback (<1ms)
  cM='MANUAL';lastPump=s;uMB('MANUAL',s);
  const rp=document.getElementById('vr');
  if(s==='ON'){rp.innerText='RUNNING';rp.className='rp on';}
  else{rp.innerText='OFF';rp.className='rp off';}
  try{
    const t=performance.now();
    const r=await fetch('/api/command?mode=MANUAL&pump='+encodeURIComponent(s));
    const d=await r.json();
    const ms=Math.round(performance.now()-t);
    document.getElementById('st').innerText='Actuated '+ms+'ms';
    document.getElementById('ak').innerText=d.success?('Manual: Pump '+d.pump):(d.reason||'Locked');
    cM=d.mode||'MANUAL';lastPump=d.pump;uMB(cM,d.pump);poll();
  }catch(e){document.getElementById('ak').innerText='Error';}
  finally{iS=false;}
}

// Instant 0ms Paint & Polling Loop
function renderAll(){drawLevel();drawFlow();drawGauge(0);renderTL();}
window.addEventListener('resize',renderAll);
requestAnimationFrame(renderAll);
addEvt('Local dashboard connected','#D4F63D');
poll();setInterval(poll,600);
</script>
</body>
</html>)rawliteral";

LocalDashboardServer::LocalDashboardServer(uint16_t port)
  : _server(port),
    _isRunning(false),
    _tankId("tank-01"),
    _lastClientAccessMs(0),
    _lastTelemetry(nullptr),
    _pumpCtrl(nullptr) {}

void LocalDashboardServer::begin(const char* tankId) {
  _tankId = tankId ? tankId : "tank-01";

  // Start Captive DNS on port 53 to redirect all domain queries to 192.168.4.1
  _dnsServer.start(LOCAL_DNS_PORT, "*", LOCAL_AP_IP);

  setupRoutes();
  _server.begin();
  _isRunning = true;

  Serial.println(F("[LocalServer] Apple iOS-Style Dashboard active at http://192.168.4.1"));
}

void LocalDashboardServer::stop() {
  if (_isRunning) {
    _server.stop();
    _dnsServer.stop();
    _isRunning = false;
    Serial.println(F("[LocalServer] Local Dashboard Server stopped."));
  }
}

void LocalDashboardServer::handleClient(uint32_t currentMillis, PumpController& pumpCtrl, const TelemetryPacket& telemetry) {
  if (!_isRunning) return;
  (void)currentMillis;
  _pumpCtrl = &pumpCtrl;
  _lastTelemetry = &telemetry;

  _dnsServer.processNextRequest();
  _server.handleClient();
}

void LocalDashboardServer::handleCors() {
  _server.sendHeader("Access-Control-Allow-Origin", "*");
  _server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  _server.sendHeader("Access-Control-Allow-Headers", "*");
}

void LocalDashboardServer::setupRoutes() {
  _server.collectHeaders("Accept-Encoding", "User-Agent");

  _server.on("/", HTTP_GET, [this]() { handleRoot(); });

  // Android Connectivity Detection — Instant 204 prevents captive hijack & connection stall
  _server.on("/generate_204", HTTP_GET, [this]() { _server.send(204); });
  _server.on("/gen_204", HTTP_GET, [this]() { _server.send(204); });
  _server.on("/connecttest.txt", HTTP_GET, [this]() { _server.send(204); });

  // Apple Captive Portal Detection (iOS / Safari)
  _server.on("/hotspot-detect.html", HTTP_GET, [this]() { handleRoot(); });
  _server.on("/canonical.html", HTTP_GET, [this]() { handleRoot(); });

  // Windows NCSI
  _server.on("/ncsi.txt", HTTP_GET, [this]() { _server.send(200, "text/plain", "Microsoft NCSI"); });
  _server.on("/redirect", HTTP_GET, [this]() { handleRoot(); });

  // Eliminate Mobile Browser 404 Storms (Favicon, Apple touch icons, Robots)
  _server.on("/favicon.ico", HTTP_GET, [this]() { _server.send(204); });
  _server.on("/apple-touch-icon.png", HTTP_GET, [this]() { _server.send(204); });
  _server.on("/apple-touch-icon-precomposed.png", HTTP_GET, [this]() { _server.send(204); });
  _server.on("/robots.txt", HTTP_GET, [this]() { _server.send(204); });

  // High-Speed REST API
  _server.on("/api/live", HTTP_GET, [this]() { handleApiLive(); });
  _server.on("/api/live", HTTP_OPTIONS, [this]() { handleCors(); _server.send(204); });

  _server.on("/api/command", HTTP_GET, [this]() { handleApiCommand(); });
  _server.on("/api/command", HTTP_POST, [this]() { handleApiCommand(); });
  _server.on("/api/command", HTTP_OPTIONS, [this]() { handleCors(); _server.send(204); });

  _server.onNotFound([this]() { handleNotFound(); });
}

void LocalDashboardServer::handleRoot() {
  _lastClientAccessMs = millis();
  handleCors();

  // Send pre-compressed GZIP payload for ultra-fast load (<50ms on mobile)
  if (_server.hasHeader("Accept-Encoding") && _server.header("Accept-Encoding").indexOf("gzip") != -1) {
    _server.sendHeader("Content-Encoding", "gzip");
    _server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    _server.send_P(200, "text/html; charset=UTF-8", (const char*)DASHBOARD_HTML_GZ, DASHBOARD_HTML_GZ_LEN);
  } else {
    _server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    _server.send_P(200, "text/html; charset=UTF-8", DASHBOARD_HTML);
  }
}

void LocalDashboardServer::handleNotFound() {
  if (_server.method() == HTTP_OPTIONS) {
    handleCors();
    _server.send(204);
    return;
  }

  String host = _server.hostHeader();
  // If the request was made directly to 192.168.4.1, do NOT redirect back to root!
  // This prevents recursive redirect loops that choke the ESP8266 web server.
  if (host.startsWith("192.168.4.1")) {
    _server.send(404, "text/plain", "Not Found");
    return;
  }

  // Redirect foreign domain captive portal queries to root
  _server.sendHeader("Location", "http://192.168.4.1/", true);
  _server.send(302, "text/plain", "");
}

void LocalDashboardServer::handleApiLive() {
  _lastClientAccessMs = millis();
  handleCors();

  unsigned long uptimeSec = millis() / 1000UL;

  // Real Relay and Pump Controller State
  bool isManual = (_pumpCtrl && _pumpCtrl->getMode() == ControlMode::MANUAL);
  const char* modeStr = isManual ? "MANUAL" : "AUTO";

  bool pumpRunning = (_pumpCtrl && _pumpCtrl->isPumpRunning());
  const char* pumpStr = pumpRunning ? "ON" : "OFF";
  const char* statusStr = _pumpCtrl ? _pumpCtrl->getStateString() : "Standby";
  const char* lockoutStr = _pumpCtrl ? _pumpCtrl->getLockoutString() : "NONE";

  // 100% Real Transducer Telemetry (Zero dummy / mock fallback values)
  bool hasRealSensor = (_lastTelemetry && _lastTelemetry->isLevelValid);
  float level = (_lastTelemetry && _lastTelemetry->levelPercent >= 0.0f) ? _lastTelemetry->levelPercent : 0.0f;
  float distance = (_lastTelemetry && _lastTelemetry->distanceCm >= 0.0f) ? _lastTelemetry->distanceCm : 0.0f;
  float flow = (_lastTelemetry && _lastTelemetry->flowRateLpm >= 0.0f) ? _lastTelemetry->flowRateLpm : 0.0f;
  float total = _lastTelemetry ? _lastTelemetry->totalLitres : 0.0f;
  float current = (_lastTelemetry && _lastTelemetry->pumpCurrentA >= 0.0f) ? _lastTelemetry->pumpCurrentA : 0.0f;
  bool waterProbe = _lastTelemetry ? _lastTelemetry->waterProbeDetected : false;
  int rawAdc = _lastTelemetry ? _lastTelemetry->rawAdc : 0;

  char buf[380];
  snprintf(buf, sizeof(buf),
    "{\"sensorConnected\":%s,\"level\":%.1f,\"distance\":%.1f,\"flow\":%.1f,\"total\":%.2f,\"current\":%.2f,\"rawAdc\":%d,\"waterProbe\":%s,\"pump\":\"%s\",\"mode\":\"%s\",\"status\":\"%s\",\"lockout\":\"%s\",\"uptime\":%lu,\"wifi\":%s,\"ip\":\"%s\"}",
    hasRealSensor ? "true" : "false",
    level, distance, flow, total, current, rawAdc,
    waterProbe ? "true" : "false",
    pumpStr, modeStr, statusStr, lockoutStr, uptimeSec,
    (WiFi.status() == WL_CONNECTED) ? "true" : "false",
    (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString().c_str() : "192.168.4.1"
  );
  _server.sendHeader("Connection", "keep-alive");
  _server.send(200, "application/json", buf);
}

void LocalDashboardServer::handleApiCommand() {
  _lastClientAccessMs = millis();
  handleCors();
  if (!_pumpCtrl) {
    _server.send(503, "application/json", "{\"success\":false,\"reason\":\"Controller not ready\"}");
    return;
  }

  String mode = _server.arg("mode");
  String pump = _server.arg("pump");
  mode.trim();
  pump.trim();

  // Mode change
  if (mode == "AUTO") {
    _pumpCtrl->requestMode(ControlMode::AUTO, millis());
  } else if (mode == "MANUAL") {
    _pumpCtrl->requestMode(ControlMode::MANUAL, millis());
  }

  // Pump relay actuation (MANUAL mode only)
  bool commandAccepted = true;
  const char* failReason = nullptr;

  if (_pumpCtrl->getMode() == ControlMode::MANUAL && pump.length() > 0) {
    bool turnOn = (pump == "ON" || pump == "1");
    CommandResult res = _pumpCtrl->requestManualPump(turnOn, millis());
    if (!res.accepted) {
      commandAccepted = false;
      failReason = res.reason;
    }
  }

  // Print high-visibility command execution banner to Serial Monitor
  Serial.println();
  Serial.println(F("╔══════════════════════════════════════════════════════════════════════╗"));
  if (commandAccepted) {
    Serial.printf(  "║   📱 LOCAL DASHBOARD COMMAND RECEIVED: [%-10s]                   ║\n", _tankId.c_str());
  } else {
    Serial.printf(  "║   ⚠️ LOCAL COMMAND BLOCKED BY SAFETY LOCKOUT: [%-10s]              ║\n", _tankId.c_str());
    Serial.printf(  "║   Reason         : %-49s ║\n", failReason ? failReason : "Safety lockout");
  }
  if (mode.length() > 0) {
    Serial.printf("║   Requested Mode : %-49s ║\n", mode.c_str());
  }
  if (pump.length() > 0) {
    Serial.printf("║   Requested Pump : %-49s ║\n", pump.c_str());
  }
  Serial.println(F("║   Source         : Direct SoftAP Web (http://192.168.4.1)            ║"));
  Serial.printf(  "║   Relay Output   : %-49s ║\n", _pumpCtrl->getPumpStateString());
  Serial.printf(  "║   Control Mode   : %-49s ║\n", _pumpCtrl->getModeString());
  Serial.printf(  "║   System State   : %-49s ║\n", _pumpCtrl->getStateString());
  Serial.printf(  "║   Safety Lockout : %-49s ║\n", _pumpCtrl->getLockoutString());
  Serial.println(F("╚══════════════════════════════════════════════════════════════════════╝"));
  Serial.println();

  char out[160];
  snprintf(out, sizeof(out), "{\"success\":%s,\"pump\":\"%s\",\"mode\":\"%s\",\"status\":\"%s\"%s%s%s}",
    commandAccepted ? "true" : "false",
    _pumpCtrl->getPumpStateString(),
    _pumpCtrl->getModeString(),
    _pumpCtrl->getStateString(),
    failReason ? ",\"reason\":\"" : "",
    failReason ? failReason : "",
    failReason ? "\"" : ""
  );
  _server.sendHeader("Connection", "keep-alive");
  _server.send(200, "application/json", out);
}

} // namespace SmartTank
