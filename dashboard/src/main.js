import { loginWithEmail, logout, onAuthChange } from './firebase/auth.js';
import { listenToTelemetry, sendCommand, ensureUserAndTankData } from './firebase/database.js';
import { isConfigured, configError } from './firebase/config.js';

// ============================================================================
// Smart Water Tank — Cloud Dashboard
// Same iOS-style UI as the local ESP dashboard, powered by Firebase RTDB
// ============================================================================

const DEFAULT_TANK_ID = 'tank-01';
let activeTankId = DEFAULT_TANK_ID;
let userRole = 'operator';
let currentUser = null;
let unsubTelemetry = null;
let currentMode = 'AUTO';

// -- Data history buffers (rolling 60 points) --
const MX = 60;
const lH = [], fH = [], cH = [];
let pC = 0, cS = 0, cN = 0, lastPump = '', lastState = '', lastWaterProbe = false;
const evts = [];

// ============================================================================
// WEB AUDIO BUZZER SOUND ENGINE (Emulates 2.5kHz hardware piezo buzzer)
// ============================================================================
let audioCtx = null;

function playWebBuzzer(freq = 2500, durationSec = 0.2, type = 'square') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationSec);
  } catch (e) {}
}

// Handle unconfigured Firebase setup immediately
if (!isConfigured) {
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = `
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #090B10; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif; gap: 16px; padding: 24px; text-align: center;">
      <div style="width: 58px; height: 58px; border-radius: 18px; background: rgba(255, 71, 87, 0.12); border: 1.5px solid rgba(255, 71, 87, 0.4); display: flex; align-items: center; justify-content: center;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FF4757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h2 style="font-size: 20px; font-weight: 800; margin: 0;">Configuration Required</h2>
      <p style="font-size: 13px; color: #8A92A6; max-width: 380px; margin: 0;">${configError || 'Firebase configuration could not be loaded.'}</p>
      <button onclick="window.location.reload()" style="background: #D4F63D; color: #090B10; border: none; padding: 10px 20px; border-radius: 9999px; font-weight: 700; cursor: pointer; margin-top: 8px;">Retry Connection</button>
    </div>`;
  }
}

// ============================================================================
// AUTH STATE LISTENER — Only triggers for users present in Firebase Authentication
// Automatically creates missing user fields & tank data matching initial JSON
// ============================================================================
onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    const loaderP = document.querySelector('#initial-loader p');
    if (loaderP) loaderP.textContent = 'Synchronizing user profile & fleet tank...';
    try {
      // Auto-provisions user profile (/users/${uid}) and allocates separate tank (/tanks/${tankId})
      const result = await ensureUserAndTankData(user.uid, user.email);
      if (result) {
        if (result.tankId) activeTankId = result.tankId;
        if (result.profile?.role) userRole = result.profile.role;
      }
    } catch (err) {
      console.error('[Auth] Failed to initialize user and tank data:', err);
    }
    showDashboard();
    startListening();
  } else {
    stopListening();
    showLogin();
  }
});

function startListening() {
  if (unsubTelemetry) unsubTelemetry();
  unsubTelemetry = listenToTelemetry(activeTankId, (data) => {
    if (data) updateDashboard(data);
  });
}

function stopListening() {
  if (unsubTelemetry) {
    unsubTelemetry();
    unsubTelemetry = null;
  }
}

// ============================================================================
// LOGIN PAGE (Monex Dark Luxury & Electric Lime Aesthetic)
// ============================================================================
function showLogin() {
  document.getElementById('app').innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-app-icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="currentColor" stroke="none"/>
        </svg>
      </div>
      <h1 class="login-title">Smart Water Tank <span class="login-title-dot"></span></h1>
      <p class="login-sub">Cloud IoT Monitoring & Autonomous Control</p>

      <form id="authForm" class="login-form">
        <div class="input-group">
          <label>Operator Email</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
              </svg>
            </span>
            <input type="email" id="authEmail" placeholder="operator@gmail.com" required autocomplete="email">
          </div>
        </div>

        <div class="input-group">
          <label>Secret Password</label>
          <div class="input-wrapper">
            <span class="input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </span>
            <input type="password" id="authPass" placeholder="••••••••" required autocomplete="current-password">
            <button type="button" class="pwd-toggle" id="pwdToggle" title="Toggle password visibility">
              <svg id="pwdEyeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>

        <div id="authError" class="login-error"></div>
        <button type="submit" class="login-btn" id="authBtn">
          <span>Sign In to Station</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </button>
      </form>

      <div class="login-footer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <span>Secured by Firebase Cloud RTDB</span>
      </div>
    </div>
  </div>`;

  const authBtn = document.getElementById('authBtn');
  const authError = document.getElementById('authError');
  const authPass = document.getElementById('authPass');
  const pwdToggle = document.getElementById('pwdToggle');
  const pwdEyeIcon = document.getElementById('pwdEyeIcon');

  let showPwd = false;
  pwdToggle.addEventListener('click', () => {
    showPwd = !showPwd;
    authPass.type = showPwd ? 'text' : 'password';
    pwdEyeIcon.innerHTML = showPwd
      ? '<path d="m9.88 9.88a3 3 0 1 0 4.24 4.24m-6.72-2.12a10.05 10.05 0 0 0-5.4 7c3-7 10-7 10-7 2.1 0 4 .6 5.6 1.7m3.4 3.3A9.97 9.97 0 0 1 22 19s-3 7-10 7a10.03 10.03 0 0 1-7-3m-3-15L21 21"/>'
      : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>';
  });

  document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const pass = authPass.value;

    authError.className = 'login-error';
    authError.innerHTML = '';
    authBtn.disabled = true;
    authBtn.innerHTML = `
      <span>Signing in...</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>`;

    try {
      await loginWithEmail(email, pass);
    } catch (err) {
      let msg = 'Login failed';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Try again later.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'Network error. Check your connection.';
      } else if (err.message) {
        msg = err.message;
      }
      authError.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${msg}</span>`;
      authError.className = 'login-error active';
      authBtn.disabled = false;
      authBtn.innerHTML = `
        <span>Sign In to Station</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>`;
    }
  });
}

// ============================================================================
// DASHBOARD PAGE (Monex & Kalo Dark Luxury Aesthetic)
// ============================================================================
function showDashboard() {
  document.getElementById('app').innerHTML = `
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
      <div class="hd-right">
        <div class="hd-b" id="connBadge"><span class="dp"></span> Cloud Live</div>
        <button class="logout-btn" onclick="window._logout()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Logout
        </button>
      </div>
    </div>

    <!-- Hero Water Level Card (Monex / Kalo) -->
    <div class="cd hero">
      <div class="tk"><div class="tf" id="tf"></div></div>
      <div class="hd2">
        <span class="hl">Water Level</span>
        <div class="hv"><span id="vl">--</span><span class="u">%</span></div>
        <div class="hs">Distance: <b id="vd">--</b></div>
        <div class="tg tg-x" id="bs">Waiting for telemetry...</div>
      </div>
    </div>

    <!-- Water Level History Chart (Neon Lime Curve) -->
    <div class="cd ch-wrap">
      <div class="ch-hd">
        <span class="ch-t">Water Level Trend</span>
        <span class="ch-v" id="ch-lv">-- %</span>
      </div>
      <canvas id="cL" height="120"></canvas>
    </div>

    <!-- 2x2 Metrics (Monex Data Chips) -->
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
        <div class="mv" style="font-size:15px;margin-top:3px" id="vs">Standby</div>
        <div class="ms">Autonomous Interlock</div>
      </div>
    </div>

    <!-- Flow Sparkline Chart (Kalo Bars + Line) -->
    <div class="cd ch-wrap">
      <div class="ch-hd">
        <span class="ch-t">Flow Rate Sparkline</span>
        <span class="ch-v" id="ch-fv">0.0 L/min</span>
      </div>
      <canvas id="cF" height="80"></canvas>
    </div>

    <!-- Current Gauge + Stats (Kalo Circular Progress Ring) -->
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

    <!-- Controls (Kalo Pill Segmented Switcher & Monex Action Buttons) -->
    <div class="cd">
      <div class="st">Control Mode</div>
      <div class="seg">
        <button class="sb a" id="ba" onclick="window._sM('AUTO')">Automatic</button>
        <button class="sb" id="bm" onclick="window._sM('MANUAL')">Manual</button>
      </div>
      <div class="ag">
        <button class="ab bs" id="as" disabled onclick="window._sP('ON')">⚡ Start</button>
        <button class="ab bp" id="ap" disabled onclick="window._sP('OFF')">🛑 Stop</button>
      </div>
      <div class="fr">
        <span>Status: <b id="ak">Standby</b></span>
        <span id="st" style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--text-sec)">Firebase RTDB</span>
      </div>
    </div>

    <!-- Activity Timeline -->
    <div class="cd">
      <div class="ch-hd"><span class="ch-t">Activity Log</span><span class="ch-v" id="tl-ct">0 events</span></div>
      <div class="tl" id="tl"></div>
    </div>

    <!-- Footer Specs List (Monex Breakdown) -->
    <div class="fl">
      <div class="fl-r"><span>Channel</span><b>☁️ Cloud RTDB</b></div>
      <div class="fl-r"><span>Tank ID</span><b>${activeTankId}</b></div>
      <div class="fl-r"><span>User</span><b id="userEmail">${currentUser?.email || '--'}</b></div>
      <div class="fl-r"><span>Role</span><b>${userRole}</b></div>
      <div class="fl-r"><span>Last Telemetry</span><b id="vu">--</b></div>
    </div>
  </div>`;

  // Initial draws
  drawLevel();
  drawFlow();
  drawGauge(0);
  renderTL();
  addEvt('Cloud dashboard connected', '#D4F63D');
}

// ============================================================================
// EXPOSE GLOBAL HANDLERS (for onclick in HTML)
// ============================================================================
window._logout = async () => {
  stopListening();
  await logout();
};

window._sM = async (mode) => {
  if (!currentUser) return;
  playWebBuzzer(2700, 0.15);
  const ak = document.getElementById('ak');
  if (ak) ak.textContent = 'Setting ' + mode + '...';
  // Instant optimistic feedback (<1ms)
  currentMode = mode;
  uMB(mode, lastPump);
  try {
    await sendCommand(activeTankId, currentUser.uid, mode, mode === 'AUTO' ? 'OFF' : (lastPump || 'OFF'));
    if (ak) ak.textContent = mode === 'AUTO' ? 'Auto Control Active' : 'Manual Standby';
    addEvt('Mode → ' + mode, '#AF52DE');
  } catch (e) {
    if (ak) ak.textContent = 'Error: ' + e.message;
  }
};

window._sP = async (state) => {
  if (!currentUser) return;
  playWebBuzzer(2500, state === 'ON' ? 0.5 : 0.25);
  const ak = document.getElementById('ak');
  if (ak) ak.textContent = 'Pump ' + state + '...';

  // Instant optimistic feedback (<1ms)
  currentMode = 'MANUAL';
  lastPump = state;
  uMB('MANUAL', state);
  const rp = document.getElementById('vr');
  if (rp) {
    if (state === 'ON') { rp.textContent = 'RUNNING'; rp.className = 'rp on'; }
    else { rp.textContent = 'OFF'; rp.className = 'rp off'; }
  }

  try {
    await sendCommand(activeTankId, currentUser.uid, 'MANUAL', state);
    if (ak) ak.textContent = 'Pump: ' + state;
    addEvt('Pump → ' + state, state === 'ON' ? '#34C759' : '#FF3B30');
  } catch (e) {
    if (ak) ak.textContent = 'Error: ' + e.message;
  }
};

// ============================================================================
// UPDATE DASHBOARD FROM FIREBASE DATA
// ============================================================================
function updateDashboard(d) {
  // Map Firebase field names to our UI
  const level = parseFloat(d.levelPercent ?? d.level ?? -1);
  const distance = parseFloat(d.distanceCm ?? d.distance ?? -1);
  const flow = parseFloat(d.flowRateLpm ?? d.flow ?? 0);
  const total = parseFloat(d.totalLitres ?? d.total ?? 0);
  const current = parseFloat(d.pumpCurrentA ?? d.current ?? 0);
  const pump = d.pumpState ?? d.pump ?? 'OFF';
  const mode = d.controlMode ?? d.mode ?? 'AUTO';
  const status = d.controllerStatus ?? d.status ?? 'Standby';
  const waterProbe = d.waterProbe ?? false;
  const rawAdc = d.rawAdc ?? '--';

  // Water Level
  const sb = document.getElementById('bs');
  if (level >= 0) {
    document.getElementById('vl').textContent = level.toFixed(1);
    document.getElementById('tf').style.height = Math.max(0, Math.min(100, level)) + '%';
    document.getElementById('vd').textContent = distance.toFixed(1) + ' cm';
    sb.textContent = 'Sensor Active'; sb.className = 'tg tg-g';
    lH.push(level); if (lH.length > MX) lH.shift();
    document.getElementById('ch-lv').textContent = level.toFixed(1) + ' %';
  } else {
    document.getElementById('vl').textContent = '--';
    document.getElementById('tf').style.height = '0%';
    document.getElementById('vd').textContent = '--';
    sb.textContent = 'Sensor Standby'; sb.className = 'tg tg-x';
    lH.push(0); if (lH.length > MX) lH.shift();
    document.getElementById('ch-lv').textContent = '-- %';
  }

  // Flow
  const fv = (flow >= 0) ? flow : 0;
  document.getElementById('vf').textContent = fv.toFixed(1);
  document.getElementById('vt').textContent = total.toFixed(2);
  fH.push(fv); if (fH.length > MX) fH.shift();
  document.getElementById('ch-fv').textContent = fv.toFixed(1) + ' L/min';

  // Current
  const cv = (current >= 0) ? current : 0;
  document.getElementById('vc').textContent = cv.toFixed(2);
  cH.push(cv); if (cH.length > MX) cH.shift();
  if (cv > pC) pC = cv;
  cS += cv; cN++;
  document.getElementById('gn').textContent = cv.toFixed(2);
  document.getElementById('gp').textContent = pC.toFixed(2) + ' A';
  document.getElementById('ga').textContent = (cN ? cS / cN : 0).toFixed(2) + ' A';
  const gsEl = document.getElementById('gs');
  if (cv > 2) { gsEl.textContent = 'High Load'; gsEl.style.color = 'var(--red)'; }
  else if (cv > 0.1) { gsEl.textContent = 'Running'; gsEl.style.color = 'var(--orange)'; }
  else { gsEl.textContent = 'Idle'; gsEl.style.color = 'var(--green)'; }
  drawGauge(cv);

  // Water Probe & Raw ADC
  const vp = document.getElementById('vp');
  if (vp) vp.innerHTML = waterProbe ? '<span style="color:var(--red)">DETECTED</span>' : '<span style="color:var(--green)">DRY</span>';
  const va = document.getElementById('va');
  if (va) va.textContent = rawAdc;

  // Relay
  const rp = document.getElementById('vr');
  if (pump === 'ON') { rp.textContent = 'RUNNING'; rp.className = 'rp on'; }
  else { rp.textContent = 'OFF'; rp.className = 'rp off'; }

  // State & Last Update
  document.getElementById('vs').textContent = status;
  const now = new Date();
  document.getElementById('vu').textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');

  // Mode
  currentMode = mode;
  uMB(mode, pump);

  // Timeline events & buzzer audio on state changes
  if (lastPump !== pump && lastPump !== '') {
    if (pump === 'ON') {
      addEvt('Pump started', '#34C759');
      playWebBuzzer(2500, 0.4);
    } else if (lastPump === 'ON') {
      addEvt('Pump stopped', '#FF3B30');
      playWebBuzzer(2500, 0.2);
    }
    lastPump = pump;
  }
  if (waterProbe && !lastWaterProbe) {
    playWebBuzzer(2000, 0.15);
    setTimeout(() => playWebBuzzer(2000, 0.15), 180);
  }
  lastWaterProbe = waterProbe;

  if (lastState !== status && lastState !== '') {
    addEvt('State → ' + status, status === 'Normal' ? '#007AFF' : '#FF9500');
  }
  lastState = status;

  // Draw charts
  drawLevel();
  drawFlow();
}

// ============================================================================
// MODE BUTTONS
// ============================================================================
function uMB(m, p) {
  const a = m === 'AUTO';
  const ba = document.getElementById('ba');
  const bm = document.getElementById('bm');
  if (ba) { ba.className = 'sb' + (a ? ' a' : ''); }
  if (bm) { bm.className = 'sb' + (!a ? ' a' : ''); }
  const as = document.getElementById('as');
  const ap = document.getElementById('ap');
  if (as) as.disabled = a;
  if (ap) ap.disabled = a;
  const ak = document.getElementById('ak');
  if (ak) {
    if (a) {
      ak.textContent = 'Auto Control Active';
    } else {
      ak.textContent = (p === 'ON' || lastPump === 'ON') ? 'Manual: Pump RUNNING' : 'Manual: Pump STOPPED';
    }
  }
}

// ============================================================================
// CANVAS CHARTS (identical to local dashboard)
// ============================================================================
function dpr() { return window.devicePixelRatio || 1; }
function initC(id, h) {
  const c = document.getElementById(id);
  if (!c) return null;
  const r = dpr();
  c.width = c.parentElement.clientWidth * r;
  c.height = h * r;
  c.style.height = h + 'px';
  const x = c.getContext('2d');
  x.scale(r, r);
  return { c, x, w: c.parentElement.clientWidth, h };
}

function drawLevel() {
  const ctx = initC('cL', 120);
  if (!ctx) return;
  const { x, w, h } = ctx;
  const pad = { t: 10, b: 22, l: 30, r: 10 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;

  // Ultra-subtle dark gridlines
  x.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ch * (i / 4);
    x.beginPath();
    x.moveTo(pad.l, y);
    x.lineTo(w - pad.r, y);
    x.stroke();
  }

  // Y-axis labels
  x.fillStyle = '#6E7688';
  x.font = '600 9px Outfit, sans-serif';
  x.textAlign = 'right';
  ['100', '75', '50', '25', '0'].forEach((v, i) => {
    x.fillText(v, pad.l - 6, pad.t + ch * (i / 4) + 3);
  });

  if (lH.length === 0) return;

  const data = lH.length === 1 ? [lH[0], lH[0]] : lH;
  const pts = data.map((v, i) => ({
    x: pad.l + (i / (data.length - 1)) * cw,
    y: pad.t + ch * (1 - Math.max(0, Math.min(100, v)) / 100)
  }));

  // Monex Electric Lime Glowing Area Fill
  const grd = x.createLinearGradient(0, pad.t, 0, h - pad.b);
  grd.addColorStop(0, 'rgba(212, 246, 61, 0.28)');
  grd.addColorStop(0.7, 'rgba(212, 246, 61, 0.06)');
  grd.addColorStop(1, 'rgba(212, 246, 61, 0.00)');

  x.beginPath();
  x.moveTo(pts[0].x, h - pad.b);
  pts.forEach(p => x.lineTo(p.x, p.y));
  x.lineTo(pts[pts.length - 1].x, h - pad.b);
  x.closePath();
  x.fillStyle = grd;
  x.fill();

  // Vibrant Electric Lime Neon Curve
  x.beginPath();
  pts.forEach((p, i) => { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); });
  x.strokeStyle = '#D4F63D';
  x.lineWidth = 2.5;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.stroke();

  // Terminal Point with Neon Halo
  const lp = pts[pts.length - 1];
  x.save();
  x.shadowColor = '#D4F63D';
  x.shadowBlur = 12;
  x.beginPath();
  x.arc(lp.x, lp.y, 4.5, 0, Math.PI * 2);
  x.fillStyle = '#D4F63D';
  x.fill();
  x.restore();

  x.beginPath();
  x.arc(lp.x, lp.y, 2, 0, Math.PI * 2);
  x.fillStyle = '#090B10';
  x.fill();
}

function drawFlow() {
  const ctx = initC('cF', 80);
  if (!ctx) return;
  const { x, w, h } = ctx;
  const pad = { t: 8, b: 8, l: 6, r: 6 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;

  if (fH.length === 0) return;

  const data = fH.length === 1 ? [fH[0], fH[0]] : fH;
  const mx = Math.max(...data, 0.5);

  const pts = data.map((v, i) => ({
    x: pad.l + (i / (data.length - 1)) * cw,
    y: pad.t + ch * (1 - v / mx)
  }));

  // Kalo-style Vertical Bars with Rounded Caps
  const bw = Math.max(3, cw / MX - 1.5);
  data.forEach((v, i) => {
    const bh = Math.max(2, (v / mx) * ch);
    const bx = pad.l + (i / (data.length - 1)) * cw - bw / 2;
    x.fillStyle = v > 0.05 ? 'rgba(212, 246, 61, 0.28)' : 'rgba(255, 255, 255, 0.04)';
    x.beginPath();
    if (x.roundRect) {
      x.roundRect(bx, h - pad.b - bh, bw, bh, [2, 2, 0, 0]);
    } else {
      x.rect(bx, h - pad.b - bh, bw, bh);
    }
    x.fill();
  });

  // Neon Cyan Sparkline Overlay
  x.beginPath();
  pts.forEach((p, i) => { i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); });
  x.strokeStyle = '#3DF6D9';
  x.lineWidth = 1.8;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.stroke();

  const lp = pts[pts.length - 1];
  x.save();
  x.shadowColor = '#3DF6D9';
  x.shadowBlur = 8;
  x.beginPath();
  x.arc(lp.x, lp.y, 3.5, 0, Math.PI * 2);
  x.fillStyle = '#3DF6D9';
  x.fill();
  x.restore();
}

function drawGauge(val) {
  const c = document.getElementById('cG');
  if (!c) return;
  const r = dpr();
  c.width = 104 * r;
  c.height = 104 * r;
  c.style.width = '104px';
  c.style.height = '104px';
  const x = c.getContext('2d');
  x.scale(r, r);
  const cx = 52, cy = 52, rad = 40, lw = 8;
  const sa = 0.75 * Math.PI, ea = 2.25 * Math.PI;
  const maxA = 5;
  const pct = Math.min(val / maxA, 1);

  // Kalo Inset Dark Track Ring
  x.beginPath();
  x.arc(cx, cy, rad, sa, ea);
  x.strokeStyle = '#191E2C';
  x.lineWidth = lw;
  x.lineCap = 'round';
  x.stroke();

  // Active Glowing Neon Arc
  if (pct > 0) {
    const va = sa + pct * (ea - sa);
    const grd = x.createLinearGradient(12, 92, 92, 12);
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
    x.save();
    x.shadowColor = pct > 0.8 ? '#FF4757' : '#D4F63D';
    x.shadowBlur = 10;
    x.beginPath();
    x.arc(cx, cy, rad, sa, va);
    x.strokeStyle = grd;
    x.lineWidth = lw;
    x.lineCap = 'round';
    x.stroke();
    x.restore();
  }

  // Numerical Ticks
  x.fillStyle = '#6E7688';
  x.font = '700 8px Outfit, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  [0, 1, 2, 3, 4, 5].forEach((t) => {
    const a = sa + (t / maxA) * (ea - sa);
    const tx = cx + Math.cos(a) * (rad + 11);
    const ty = cy + Math.sin(a) * (rad + 11);
    x.fillText(t, tx, ty);
  });
}

// ============================================================================
// TIMELINE
// ============================================================================
function addEvt(msg, color) {
  const now = new Date();
  const ts = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
  evts.unshift({ msg, color, ts });
  if (evts.length > 8) evts.pop();
  renderTL();
}

function renderTL() {
  const el = document.getElementById('tl');
  const ct = document.getElementById('tl-ct');
  if (!el || !ct) return;
  ct.textContent = evts.length + ' events';
  if (!evts.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text-sec);padding:8px 0">No events yet</div>';
    return;
  }
  el.innerHTML = evts.map((e, i) =>
    '<div class="tl-item"><div class="tl-dot" style="background:' + e.color + '"></div>' +
    (i < evts.length - 1 ? '<div class="tl-line"></div>' : '') +
    '<div class="tl-body"><div class="tl-msg">' + e.msg + '</div><div class="tl-time">' + e.ts + '</div></div></div>'
  ).join('');
}
