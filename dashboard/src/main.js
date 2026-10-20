import './style.css';
import { isConfigured, configError } from './firebase/config.js';
import {
  loginWithEmail,
  logoutUser,
  subscribeToAuthState,
  createOperatorUser,
  deleteOperatorUser,
  getNextAvailableTankId
} from './firebase/auth.js';
import {
  subscribeToDatabaseConnection,
  subscribeToTankLive,
  subscribeToTankHistory,
  subscribeToTankAlerts,
  subscribeToAllTanks,
  subscribeToAllUsers,
  submitTankCommand,
  subscribeToCommandAcks
} from './firebase/database.js';
import { isTelemetryStale } from './firebase/validation.js';

const app = document.querySelector('#app');

// Master Application State
let state = {
  user: null,
  profile: null, // { email, role: 'admin'|'operator', assignedTankId }
  dbConnected: false,

  // Admin Views State
  adminTab: 'fleet', // 'fleet' | 'operators' | 'control'
  fleetFilter: 'all', // 'all' | 'running' | 'low'
  fleetSearchQuery: '',
  allTanks: {},
  allUsers: {},
  selectedAdminTankId: 'tank-01',
  userCreationLoading: false,
  userCreationFeedback: null,
  provisioningLoading: false,
  provisioningFeedback: null,
  scannedWifiList: [],

  // Active Tank Data (for Operator or Admin inspected tank)
  activeTankLive: null,
  activeTankHistory: [],
  activeTankAlerts: [],
  activeTankAcks: {},
  lastCommandAck: null,

  // Control State
  selectedMode: 'AUTO',
  commandLoading: false,
  commandFeedback: null,

  // Hybrid Connection Mode: 'cloud' | 'local'
  connectionMode: 'cloud',
  localHostUrl: 'http://192.168.4.1',
  localPin: 'admin123',
  localPollInterval: null,

  // Auth form state
  authLoading: false,
  authError: null
};

// Cleanup callbacks
let activeUnsubscribers = [];

function clearListeners() {
  activeUnsubscribers.forEach((unsub) => {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (e) { /* ignore */ }
    }
  });
  activeUnsubscribers = [];
}

function initListeners() {
  clearListeners();

  // 1. Connection listener
  const unsubConn = subscribeToDatabaseConnection((connected) => {
    state.dbConnected = connected;
    updateConnectionBadge();
  });
  activeUnsubscribers.push(unsubConn);

  if (!state.user || !state.profile) return;

  if (state.profile.role === 'admin') {
    // Admin: subscribe to all tanks fleet & all users
    const unsubTanks = subscribeToAllTanks((tanks) => {
      state.allTanks = tanks || {};
      const tankIds = Object.keys(state.allTanks);
      if (tankIds.length > 0 && !state.allTanks[state.selectedAdminTankId]) {
        state.selectedAdminTankId = tankIds[0];
      }
      render();
    });
    activeUnsubscribers.push(unsubTanks);

    const unsubUsers = subscribeToAllUsers((users) => {
      state.allUsers = users || {};
      render();
    });
    activeUnsubscribers.push(unsubUsers);

    // Also listen to the selected tank for deep dive control
    initSingleTankListeners(state.selectedAdminTankId);
  } else {
    // Operator: subscribe exclusively to their assigned tank
    const tankId = state.profile.assignedTankId || 'tank-01';
    initSingleTankListeners(tankId);
  }
}

function initSingleTankListeners(tankId) {
  if (!tankId) return;

  const unsubLive = subscribeToTankLive(tankId, (data) => {
    state.activeTankLive = data;
    if (data && data.controlMode) {
      state.selectedMode = data.controlMode;
    }
    render();
  });
  activeUnsubscribers.push(unsubLive);

  const unsubHistory = subscribeToTankHistory(tankId, (historyList) => {
    state.activeTankHistory = historyList;
    if (state.adminTab === 'control' || state.profile?.role === 'operator') {
      render();
    }
  });
  activeUnsubscribers.push(unsubHistory);

  const unsubAlerts = subscribeToTankAlerts(tankId, (alertsList) => {
    state.activeTankAlerts = alertsList;
    if (state.adminTab === 'control' || state.profile?.role === 'operator') {
      render();
    }
  });
  activeUnsubscribers.push(unsubAlerts);

  const unsubAcks = subscribeToCommandAcks(tankId, (acks) => {
    state.activeTankAcks = acks || {};
    const ackList = Object.values(state.activeTankAcks);
    if (ackList.length > 0) {
      ackList.sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));
      state.lastCommandAck = ackList[0];
    } else {
      state.lastCommandAck = null;
    }
    if (state.adminTab === 'control' || state.profile?.role === 'operator') {
      render();
    }
  });
  activeUnsubscribers.push(unsubAcks);
}

function updateConnectionBadge() {
  const badge = document.querySelector('#connection-badge');
  if (badge) {
    if (state.connectionMode === 'local') {
      badge.className = `badge ${state.dbConnected ? 'badge-local' : 'badge-danger'}`;
      badge.innerHTML = `<span class="badge-dot"></span> ${state.dbConnected ? 'Direct Local Link: Online' : 'Direct Link: Disconnected'}`;
    } else {
      badge.className = `badge ${state.dbConnected ? 'badge-status' : 'badge-danger'}`;
      badge.innerHTML = `<span class="badge-dot"></span> ${state.dbConnected ? 'Realtime DB: Online' : 'Realtime DB: Offline'}`;
    }
  }
}

// Router Render
function render() {
  if (!isConfigured) {
    renderConfigError();
    return;
  }

  if (!state.user) {
    renderLoginView();
    return;
  }

  if (state.profile?.role === 'admin') {
    renderAdminDashboard();
  } else {
    renderOperatorDashboard();
  }
}

function renderConfigError() {
  app.innerHTML = `
    <header class="header-card">
      <div class="header-top">
        <span class="badge badge-danger"><span class="badge-dot"></span> Configuration Error</span>
      </div>
      <div class="title-container">
        <h1>Smart Water Tank Monitoring System</h1>
        <p>Firebase configuration is missing or incomplete.</p>
      </div>
    </header>
    <div class="notice-box notice-error">
      <div class="notice-icon">⚠️</div>
      <div class="notice-content">
        <h4>Environment Setup Required</h4>
        <p>${configError || 'Please configure dashboard/.env.local with valid VITE_FIREBASE_* keys.'}</p>
      </div>
    </div>
  `;
}

// ==========================================
// UNIFIED LOGIN VIEW (LIGHT THEME)
// ==========================================
function renderLoginView() {
  const isCloud = state.connectionMode === 'cloud';

  app.innerHTML = `
    <header class="header-card">
      <div class="header-top">
        <span class="badge badge-phase"><span class="badge-dot"></span> Smart Water Tank System</span>
        <span class="badge ${isCloud ? 'badge-status' : 'badge-local'}">
          <span class="badge-dot"></span> ${isCloud ? 'Cloud Gateway Online' : 'Direct Local Link (AP Mode)'}
        </span>
      </div>
      <div class="title-container">
        <h1>Smart Water Tank Management Portal</h1>
        <p>Unified authentication gateway for System Administrators and Designated Tank Operators.</p>
      </div>
    </header>

    <div class="auth-wrapper">
      <div class="auth-card">
        <!-- Hybrid Connection Mode Selector -->
        <div style="display: flex; background: var(--bg-surface-subtle); border-radius: 12px; padding: 0.3rem; margin-bottom: 1.5rem; border: 1px solid var(--border-light);">
          <button type="button" id="tab-cloud-mode" style="flex: 1; padding: 0.6rem; font-size: 0.85rem; font-weight: 700; border: none; border-radius: 9px; cursor: pointer; transition: all 0.2s; background: ${isCloud ? '#ffffff' : 'transparent'}; color: ${isCloud ? 'var(--brand-primary)' : 'var(--text-muted)'}; box-shadow: ${isCloud ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'};">
            ☁️ Cloud Gateway
          </button>
          <button type="button" id="tab-local-mode" style="flex: 1; padding: 0.6rem; font-size: 0.85rem; font-weight: 700; border: none; border-radius: 9px; cursor: pointer; transition: all 0.2s; background: ${!isCloud ? '#ffffff' : 'transparent'}; color: ${!isCloud ? 'var(--brand-primary)' : 'var(--text-muted)'}; box-shadow: ${!isCloud ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'};">
            📡 Direct Local Link
          </button>
        </div>

        <div class="auth-header">
          <h2>${isCloud ? 'Cloud Sign In' : 'Direct Controller Access'}</h2>
          <p>${isCloud ? 'Enter your Administrator or Operator credentials' : 'Connect directly to your local ESP8266 controller'}</p>
        </div>

        ${isCloud ? `
          <form id="login-form-cloud" class="auth-form">
            ${state.authError ? `<div class="auth-error" role="alert">${state.authError}</div>` : ''}
            
            <div class="form-group">
              <label for="input-email">Email Address</label>
              <input type="email" id="input-email" class="form-input" placeholder="admin@example.com" required autocomplete="email" />
            </div>

            <div class="form-group">
              <label for="input-password">Password</label>
              <input type="password" id="input-password" class="form-input" placeholder="••••••••" required autocomplete="current-password" />
            </div>

            <button type="submit" class="btn-primary" id="btn-submit-login" ${state.authLoading ? 'disabled' : ''} style="width: 100%; margin-top: 0.5rem;">
              ${state.authLoading ? 'Authenticating...' : 'Sign In to Cloud'}
            </button>
          </form>
        ` : `
          <form id="login-form-local" class="auth-form">
            ${state.authError ? `<div class="auth-error" role="alert">${state.authError}</div>` : ''}
            
            <div id="detected-tank-banner" style="background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.2); border-radius: 10px; padding: 0.65rem 0.85rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.1rem;">📡</span>
                <div style="font-size: 0.8rem; color: var(--text-primary);">
                  Connected Unit: <strong id="detected-tank-id">Auto-detecting...</strong>
                  <span style="color: var(--text-muted); display: block; font-size: 0.72rem;">Hardware controller at ${state.localHostUrl}</span>
                </div>
              </div>
              <a href="${state.localHostUrl}/setup" target="_blank" style="font-size: 0.75rem; color: var(--brand-primary); font-weight: 700; text-decoration: none; padding: 0.3rem 0.6rem; background: #fff; border: 1px solid var(--border-light); border-radius: 6px;">
                ⚙️ Setup Wi-Fi
              </a>
            </div>

            <div class="form-group">
              <label for="input-local-email">Firebase Operator Email</label>
              <input type="email" id="input-local-email" class="form-input" placeholder="operator1@example.com" required autocomplete="email" />
            </div>

            <div class="form-group">
              <label for="input-local-pass">Password</label>
              <input type="password" id="input-local-pass" class="form-input" placeholder="••••••••" required autocomplete="current-password" />
            </div>

            <div class="form-group">
              <label for="input-local-url">Controller IP / Address</label>
              <input type="text" id="input-local-url" class="form-input" value="${state.localHostUrl}" required placeholder="http://192.168.4.1" />
              <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; display: block;">Connect your phone/PC to 'SmartTank-01' Wi-Fi before connecting.</span>
            </div>

            <button type="submit" class="btn-primary" id="btn-submit-local" ${state.authLoading ? 'disabled' : ''} style="width: 100%; margin-top: 0.5rem;">
              ${state.authLoading ? 'Authenticating with Firebase...' : 'Sign In & Connect to Local Tank'}
            </button>

            <div style="margin-top: 1rem; padding-top: 0.85rem; border-top: 1px dashed var(--border-light); text-align: center;">
              <a href="${state.localHostUrl}/setup" target="_blank" style="font-size: 0.8rem; color: var(--brand-primary); font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;">
                ⚙️ Open Technician Wi-Fi &amp; Tank Assignment Wizard &rarr;
              </a>
            </div>
          </form>
        `}

        <div class="auth-help">
          <p><strong>Hybrid Connectivity:</strong> ${isCloud ? 'Cloud Gateway provides remote monitoring and fleet control over cellular/broadband.' : 'Direct Local Link connects directly to the NodeMCU without internet or home routers.'}</p>
        </div>
      </div>
    </div>

    <footer>
      <p>Smart Water Tank Monitoring System &bull; Multi-Tenant IoT Architecture &bull; Hybrid Engine</p>
    </footer>
  `;

  // Toggle Mode Listeners
  document.querySelector('#tab-cloud-mode')?.addEventListener('click', () => {
    state.connectionMode = 'cloud';
    state.authError = null;
    render();
  });

  document.querySelector('#tab-local-mode')?.addEventListener('click', () => {
    state.connectionMode = 'local';
    state.authError = null;
    render();
  });

  // Probe local hardware controller in local mode
  if (!isCloud) {
    fetch(`${state.localHostUrl}/api/live`, { signal: AbortSignal.timeout(1500) })
      .then(res => res.json())
      .then(data => {
        const el = document.querySelector('#detected-tank-id');
        if (el && data.tankId) {
          el.innerText = `UNIT ${data.tankId.toUpperCase()} (Online)`;
          el.style.color = '#047857';
        }
      })
      .catch(() => {
        const el = document.querySelector('#detected-tank-id');
        if (el) {
          el.innerText = 'Not Detected (Connect to SmartTank Wi-Fi)';
          el.style.color = '#b45309';
        }
      });
  }

  // Cloud Login
  document.querySelector('#login-form-cloud')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.querySelector('#input-email').value;
    const password = document.querySelector('#input-password').value;

    state.authLoading = true;
    state.authError = null;
    render();

    try {
      await loginWithEmail(email, password);
    } catch (err) {
      state.authError = err.message;
      state.authLoading = false;
      render();
    }
  });

  // Local Controller Login via Firebase Authentication
  document.querySelector('#login-form-local')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.querySelector('#input-local-email').value.trim();
    const password = document.querySelector('#input-local-pass').value.trim();
    const host = document.querySelector('#input-local-url').value.trim();

    state.localHostUrl = host;
    state.authLoading = true;
    state.authError = null;
    render();

    try {
      // 1. Authenticate with Firebase Authentication
      const { user, profile } = await loginWithEmail(email, password);

      // 2. Query local controller to verify it is reachable and get its tankId
      let res;
      try {
        res = await fetch(`${host}/api/live`);
      } catch (networkErr) {
        throw new Error(`Cannot reach controller at ${host}. Please ensure you are connected to the 'SmartTank' Wi-Fi network.`);
      }

      if (!res.ok) {
        throw new Error(`Controller at ${host} responded with HTTP ${res.status}`);
      }
      const data = await res.json();

      // 3. Multi-Tenant Role & Tank Assignment Verification
      const controllerTankId = data.tankId || 'tank-01';
      if (profile.role !== 'admin' && profile.assignedTankId !== controllerTankId) {
        await logoutUser();
        throw new Error(`Access Denied: Your account (${email}) is designated for '${profile.assignedTankId || 'None'}', but this hardware controller is '${controllerTankId}'.`);
      }

      // 4. Authorized: Activate local direct link session
      state.connectionMode = 'local';
      state.user = user;
      state.profile = profile;
      state.activeTankLive = data;
      state.dbConnected = true;
      state.authLoading = false;

      // Start local polling
      if (state.localPollInterval) clearInterval(state.localPollInterval);
      state.localPollInterval = setInterval(async () => {
        try {
          const liveRes = await fetch(`${state.localHostUrl}/api/live`);
          if (liveRes.ok) {
            state.activeTankLive = await liveRes.json();
            render();
          }
        } catch (e) { /* ignore periodic poll hiccup */ }
      }, 1500);

      render();
    } catch (err) {
      state.authError = 'Local connection failed: ' + err.message;
      state.authLoading = false;
      render();
    }
  });
}

// ==========================================
// ADMIN DASHBOARD VIEW (LIGHT THEME)
// ==========================================
function renderAdminDashboard() {
  const tankEntries = Object.entries(state.allTanks);
  const userEntries = Object.entries(state.allUsers);

  // Compute Fleet Analytics
  const totalTanks = tankEntries.length;
  let runningPumpsCount = 0;
  let totalLitresStored = 0;
  let sumLevelPercent = 0;
  let validLevelCount = 0;

  tankEntries.forEach(([, tank]) => {
    const live = tank?.live || {};
    if (live.pumpState === 'ON') runningPumpsCount++;
    if (typeof live.totalLitres === 'number') totalLitresStored += live.totalLitres;
    if (typeof live.levelPercent === 'number') {
      sumLevelPercent += live.levelPercent;
      validLevelCount++;
    }
  });

  const avgLevel = validLevelCount > 0 ? (sumLevelPercent / validLevelCount).toFixed(1) : '--';
  const totalOperators = userEntries.filter(([, u]) => u.role === 'operator').length;

  app.innerHTML = `
    <!-- Header Card -->
    <header class="header-card">
      <div class="header-top">
        <span class="badge badge-phase"><span class="badge-dot"></span> Central Admin Supervisory Console</span>
        <span id="connection-badge" class="badge ${state.dbConnected ? 'badge-status' : 'badge-danger'}">
          <span class="badge-dot"></span> ${state.dbConnected ? 'Realtime DB: Online' : 'Realtime DB: Offline'}
        </span>
      </div>
      <div class="title-container">
        <h1>Admin Fleet & User Management</h1>
        <p>Global real-time oversight of all water storage units, live pump telemetry, and operator assignments.</p>
      </div>
    </header>

    <!-- User Account Ribbon -->
    <div class="user-bar">
      <div class="user-info">
        <span>Logged in as: <strong class="user-email">${state.user.email}</strong></span>
        <span class="badge badge-indigo">MASTER ADMIN</span>
        <span class="badge badge-phase">FLEET CONTROLLER</span>
      </div>
      <button class="btn-signout" id="btn-logout">Sign Out</button>
    </div>

    <!-- Fleet Analytics KPI Ribbon -->
    <section class="fleet-kpi-ribbon">
      <div class="kpi-card">
        <div class="kpi-icon kpi-icon-blue">🌊</div>
        <div class="kpi-details">
          <span class="kpi-label">Monitored Fleet</span>
          <div class="kpi-value">${totalTanks} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: normal;">Units</span></div>
          <span class="kpi-subtext">Active IoT units reporting</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon ${runningPumpsCount > 0 ? 'kpi-icon-green' : 'kpi-icon-indigo'}">⚙️</div>
        <div class="kpi-details">
          <span class="kpi-label">Active Pumps</span>
          <div class="kpi-value">${runningPumpsCount} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: normal;">Running</span></div>
          <span class="kpi-subtext">${totalTanks - runningPumpsCount} pumps currently standby</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon kpi-icon-blue">📊</div>
        <div class="kpi-details">
          <span class="kpi-label">Average Water Level</span>
          <div class="kpi-value">${avgLevel}<span style="font-size: 1rem; color: var(--brand-primary);">%</span></div>
          <span class="kpi-subtext">${totalLitresStored.toFixed(0)} L total volume</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon kpi-icon-amber">👥</div>
        <div class="kpi-details">
          <span class="kpi-label">Designated Operators</span>
          <div class="kpi-value">${totalOperators} <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: normal;">Users</span></div>
          <span class="kpi-subtext">Isolated tank assignments</span>
        </div>
      </div>
    </section>

    <!-- Navigation Segmented Tabs -->
    <div class="nav-tab-container">
      <button class="nav-tab-btn ${state.adminTab === 'fleet' ? 'active' : ''}" id="tab-admin-fleet">
        🌊 All Tanks Fleet (${totalTanks})
      </button>
      <button class="nav-tab-btn ${state.adminTab === 'operators' ? 'active' : ''}" id="tab-admin-operators">
        👥 Add & Manage Operators
      </button>
      <button class="nav-tab-btn ${state.adminTab === 'setup' ? 'active' : ''}" id="tab-admin-setup">
        🔧 Tank &amp; Wi-Fi Setup
      </button>
      <button class="nav-tab-btn ${state.adminTab === 'control' ? 'active' : ''}" id="tab-admin-control">
        ⚙️ Deep-Dive Tank Controller
      </button>
    </div>

    <!-- Active Tab Body -->
    ${renderAdminTabContent()}

    <footer>
      <p>Smart Water Tank Monitoring System &bull; Multi-Tenant IoT Cloud Architecture &bull; Administrator Master View</p>
    </footer>
  `;

  attachAdminEventListeners();
}

function renderAdminTabContent() {
  if (state.adminTab === 'operators') {
    return renderOperatorManagementView();
  }
  if (state.adminTab === 'control') {
    return renderTankInspectorView(state.selectedAdminTankId);
  }
  if (state.adminTab === 'setup') {
    return renderAdminProvisioningView();
  }
  return renderFleetOverviewView();
}

// ----------------------------------------------------
// TAB 1: ALL TANKS FLEET OVERVIEW
// ----------------------------------------------------
function renderFleetOverviewView() {
  let tankEntries = Object.entries(state.allTanks);

  // Apply filters
  if (state.fleetFilter === 'running') {
    tankEntries = tankEntries.filter(([, t]) => t?.live?.pumpState === 'ON');
  } else if (state.fleetFilter === 'low') {
    tankEntries = tankEntries.filter(([, t]) => (t?.live?.levelPercent ?? 100) < 30);
  }

  // Apply search query
  if (state.fleetSearchQuery.trim()) {
    const q = state.fleetSearchQuery.toLowerCase().trim();
    tankEntries = tankEntries.filter(([id, t]) => {
      return id.toLowerCase().includes(q) || (t?.name && t.name.toLowerCase().includes(q));
    });
  }

  return `
    <section>
      <!-- Section Toolbar -->
      <div class="section-header">
        <div>
          <h2 class="section-title"><span class="indicator"></span> Live Water Storage Fleet</h2>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.2rem;">Click any storage unit to inspect telemetry or dispatch manual pump overrides</p>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
          <input 
            type="text" 
            id="fleet-search-input" 
            class="form-input" 
            placeholder="🔍 Search tanks..." 
            value="${state.fleetSearchQuery}" 
            style="width: 200px; padding: 0.5rem 0.85rem; font-size: 0.85rem;" 
          />

          <div class="control-mode-toggle" style="padding: 0.2rem;">
            <button class="mode-btn ${state.fleetFilter === 'all' ? 'active' : ''}" id="filter-all" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">All</button>
            <button class="mode-btn ${state.fleetFilter === 'running' ? 'active' : ''}" id="filter-running" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">Pumps ON</button>
            <button class="mode-btn ${state.fleetFilter === 'low' ? 'active' : ''}" id="filter-low" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">Low Level</button>
          </div>
        </div>
      </div>

      ${tankEntries.length === 0 ? `
        <div class="form-card" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🌊</div>
          <h3 style="font-family: var(--font-heading); color: var(--text-primary); font-size: 1.25rem;">No storage units match your criteria</h3>
          <p style="color: var(--text-secondary); font-size: 0.95rem; margin-top: 0.35rem;">
            ${Object.keys(state.allTanks).length === 0 
              ? 'Get started by registering an operator in the <strong>Add & Manage Operators</strong> tab. The system will auto-assign their first tank.' 
              : 'Try clearing your search query or filter.'}
          </p>
        </div>
      ` : `
        <div class="module-grid">
          ${tankEntries.map(([tankId, tank]) => {
            const live = tank.live || {};
            const level = typeof live.levelPercent === 'number' ? live.levelPercent : null;
            const isPumpOn = live.pumpState === 'ON';
            const isStale = live.updatedAt ? isTelemetryStale(live.updatedAt) : true;
            
            // Accent color based on condition
            let cardAccent = isPumpOn ? '#10b981' : '#0284c7';
            let cylinderClass = '';
            if (level !== null && level < 25) {
              cardAccent = '#dc2626';
              cylinderClass = 'critical';
            } else if (level !== null && level < 45) {
              cylinderClass = 'warning';
            }

            // Find assigned operator email
            let operatorEmail = 'Unassigned';
            if (tank.assignedTo && state.allUsers[tank.assignedTo]) {
              operatorEmail = state.allUsers[tank.assignedTo].email;
            }

            return `
              <article class="module-card" style="--card-accent: ${cardAccent};">
                <div>
                  <div class="module-card-header">
                    <span class="tank-badge-pill">${tankId.toUpperCase()}</span>
                    <span class="badge ${isPumpOn ? 'badge-status' : 'badge-phase'}">
                      <span class="badge-dot"></span> PUMP ${live.pumpState || 'OFF'}
                    </span>
                  </div>

                  <h3 class="tank-title">${tank.name || tankId}</h3>
                  <div class="tank-operator-meta">
                    <span>👤 Operator:</span> <strong>${operatorEmail}</strong>
                  </div>

                  <!-- Visual Cylinder Meter -->
                  <div class="tank-visual-wrap">
                    <div class="water-cylinder">
                      <div class="water-cylinder-fill ${cylinderClass}" style="height: ${level !== null ? Math.min(100, Math.max(0, level)) : 0}%;"></div>
                    </div>
                    <div>
                      <div class="card-label">Current Water Level</div>
                      <div class="tank-level-number">
                        ${level !== null ? level.toFixed(1) : '--'}<small>%</small>
                      </div>
                      <div class="level-bar-track" style="width: 140px; margin-top: 0.35rem;">
                        <div class="level-bar-fill" style="width: ${level !== null ? Math.min(100, Math.max(0, level)) : 0}%;"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Metrics Snapshot -->
                  <div class="tank-metrics-grid">
                    <div class="tank-metric-item">
                      <span class="tank-metric-label">Flow Rate</span>
                      <span class="tank-metric-val">${live.flowRateLpm ?? '--'} L/m</span>
                    </div>
                    <div class="tank-metric-item">
                      <span class="tank-metric-label">Pump Current</span>
                      <span class="tank-metric-val">${live.pumpCurrentA ?? '--'} A</span>
                    </div>
                    <div class="tank-metric-item">
                      <span class="tank-metric-label">Control Mode</span>
                      <span class="tank-metric-val">${live.controlMode ?? 'AUTO'}</span>
                    </div>
                    <div class="tank-metric-item">
                      <span class="tank-metric-label">IoT Gateway</span>
                      <span class="tank-metric-val" style="color: ${live.wifiConnected ? '#059669' : '#dc2626'};">
                        ${live.wifiConnected ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <button class="btn-primary btn-inspect-tank" data-tank-id="${tankId}" style="width: 100%; padding: 0.65rem 1rem; font-size: 0.9rem;">
                    Inspect & Dispatch Controls →
                  </button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `}
    </section>
  `;
}

// ----------------------------------------------------
// TAB 2: OPERATOR MANAGEMENT & AUTO-ASSIGNED TANK
// ----------------------------------------------------
function renderOperatorManagementView() {
  const userEntries = Object.entries(state.allUsers);
  
  // Dynamically compute the next available sequential tank ID
  const nextTankId = getNextAvailableTankId(state.allTanks, state.allUsers);
  const nextTankNumber = nextTankId.replace(/^tank-?/i, '');
  const suggestedTankName = `Water Storage Unit ${nextTankNumber.toUpperCase()}`;

  return `
    <section style="display: flex; flex-direction: column; gap: 1.75rem;">
      <!-- Operator Registration Card -->
      <div class="form-card">
        <div class="section-header">
          <div>
            <h2 class="section-title"><span class="indicator"></span> Add New Operator User</h2>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.2rem;">
              Register an operator account. The system will automatically provision and assign the next sequential water tank.
            </p>
          </div>
        </div>

        <!-- Automatic Tank Assignment Banner -->
        <div class="auto-tank-banner">
          <div>
            <div style="font-weight: 700; color: #0369a1; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem;">
              <span>⚡</span> Automatic Tank Provisioning Active
            </div>
            <div style="font-size: 0.85rem; color: #0284c7; margin-top: 0.15rem;">
              This operator will be automatically bound to the next available storage unit in sequence.
            </div>
          </div>
          <div class="auto-tank-badge">
            Assigned: ${nextTankId.toUpperCase()}
          </div>
        </div>

        ${state.userCreationFeedback ? `
          <div class="notice-box notice-${state.userCreationFeedback.type === 'danger' ? 'error' : 'info'}">
            <div class="notice-icon">${state.userCreationFeedback.type === 'danger' ? '⚠️' : '✅'}</div>
            <div class="notice-content">
              <h4>${state.userCreationFeedback.type === 'danger' ? 'Registration Error' : 'Success'}</h4>
              <p>${state.userCreationFeedback.message}</p>
            </div>
          </div>
        ` : ''}

        <form id="create-operator-form">
          <div class="form-grid-3">
            <div class="form-group">
              <label for="op-email">Operator Email Address</label>
              <input type="email" id="op-email" class="form-input" placeholder="e.g. operator1@building-a.local" required />
            </div>

            <div class="form-group">
              <label for="op-password">Temporary Password</label>
              <input type="password" id="op-password" class="form-input" placeholder="Min 6 characters" required minlength="6" />
            </div>

            <div class="form-group">
              <label for="op-tank-id">Assigned Tank ID (Auto-Generated)</label>
              <input 
                type="text" 
                id="op-tank-id" 
                class="form-input" 
                value="${nextTankId}" 
                required 
                style="font-family: var(--font-mono); font-weight: 600; color: #0284c7; background: #f0f9ff;" 
              />
            </div>

            <div class="form-group">
              <label for="op-tank-name">Tank Friendly Name</label>
              <input 
                type="text" 
                id="op-tank-name" 
                class="form-input" 
                value="${suggestedTankName}" 
                placeholder="e.g. Block A Overhead Tank" 
              />
            </div>

            <div>
              <button 
                type="submit" 
                class="btn-primary" 
                id="btn-create-op" 
                ${state.userCreationLoading ? 'disabled' : ''} 
                style="width: 100%; height: 48px;"
              >
                ${state.userCreationLoading ? 'Provisioning...' : '➕ Register & Provision Tank'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <!-- User Directory Table -->
      <div class="table-container">
        <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
          <h3 class="section-title"><span class="indicator"></span> System User Directory (${userEntries.length})</h3>
          <span style="font-size: 0.825rem; color: var(--text-muted);">Real-time database sync</span>
        </div>

        ${userEntries.length === 0 ? `
          <div style="padding: 2.5rem; text-align: center; color: var(--text-secondary);">
            No user records found in the database.
          </div>
        ` : `
          <table class="data-table">
            <thead>
              <tr>
                <th>User Account</th>
                <th>Role</th>
                <th>Assigned Water Tank</th>
                <th>Firebase UID</th>
                <th>Registered Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${userEntries.map(([uid, u]) => {
                const isAdmin = u.role === 'admin';
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 600; color: var(--text-primary);">${u.email || 'No email recorded'}</div>
                    </td>
                    <td>
                      <span class="badge ${isAdmin ? 'badge-indigo' : 'badge-status'}">
                        ${(u.role || 'operator').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      ${isAdmin 
                        ? `<span class="badge badge-phase">ALL (SUPERVISORY)</span>` 
                        : `<span class="tank-badge-pill">${(u.assignedTankId || 'UNASSIGNED').toUpperCase()}</span>`
                      }
                    </td>
                    <td>
                      <span style="font-family: var(--font-mono); font-size: 0.775rem; color: var(--text-muted);">${uid.substring(0, 10)}...</span>
                    </td>
                    <td style="font-size: 0.85rem; color: var(--text-secondary);">
                      ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '--'}
                    </td>
                    <td>
                      ${!isAdmin ? `
                        <button class="btn-delete-user" data-uid="${uid}" data-tank-id="${u.assignedTankId || ''}">
                          Remove
                        </button>
                      ` : `<span style="font-size: 0.8rem; color: var(--text-muted);">Primary Admin</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    </section>
  `;
}

// ----------------------------------------------------
// TAB 3: DEEP-DIVE TANK INSPECTOR & CONTROLLER
// ----------------------------------------------------
function renderTankInspectorView(tankId) {
  const tank = state.allTanks[tankId] || {};
  const live = state.activeTankLive || tank.live || {};
  const tankIds = Object.keys(state.allTanks);

  if (tankIds.length === 0) {
    return `
      <div class="form-card" style="text-align: center; padding: 3.5rem 1.5rem;">
        <div style="font-size: 2.75rem; margin-bottom: 0.75rem;">⚙️</div>
        <h3 style="font-family: var(--font-heading); color: var(--text-primary); font-size: 1.35rem;">No Water Tanks Registered Yet</h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem; margin-top: 0.35rem;">
          There are currently no storage tanks in the fleet.<br>
          Switch to the <strong>Add & Manage Operators</strong> tab to register your first operator and auto-provision <strong>tank-01</strong>.
        </p>
      </div>
    `;
  }

  const formatVal = (v, suffix = '', fallback = '--') => {
    return (v !== null && v !== undefined) ? `${v}${suffix}` : fallback;
  };

  const isStale = live?.updatedAt ? isTelemetryStale(live.updatedAt) : true;

  return `
    <section style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Controller Header Bar -->
      <div class="controller-header-bar">
        <div>
          <span class="card-label">Active Inspected Unit</span>
          <h2 style="font-family: var(--font-heading); font-size: 1.5rem; color: var(--text-primary);">
            ${tank.name || tankId.toUpperCase()}
          </h2>
        </div>

        <div style="display: flex; align-items: center; gap: 1rem;">
          <label for="tank-picker" style="font-size: 0.875rem; font-weight: 600; color: var(--text-secondary);">Switch Tank:</label>
          <select id="tank-picker" class="tank-selector-dropdown">
            ${tankIds.map((id) => `
              <option value="${id}" ${id === tankId ? 'selected' : ''}>
                ${id.toUpperCase()} — ${(state.allTanks[id]?.name) || 'Water Tank'}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Feedback notice on command dispatch -->
      ${state.commandFeedback ? `
        <div class="notice-box notice-${state.commandFeedback.type === 'danger' ? 'error' : 'info'}">
          <div class="notice-icon">${state.commandFeedback.type === 'danger' ? '⚠️' : '✅'}</div>
          <div class="notice-content">
            <h4>${state.commandFeedback.type === 'danger' ? 'Command Rejected' : 'Command Dispatched'}</h4>
            <p>${state.commandFeedback.message}</p>
          </div>
        </div>
      ` : ''}

      <!-- Telemetry Cards Grid -->
      <div class="telemetry-grid">
        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Water Level</span>
            <span class="card-icon">🌊</span>
          </div>
          <div class="card-value">
            ${formatVal(live?.levelPercent)} <span class="card-unit">%</span>
          </div>
          <div class="level-bar-track">
            <div class="level-bar-fill" style="width: ${live?.levelPercent ? Math.min(100, Math.max(0, live.levelPercent)) : 0}%;"></div>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Capacity utilization</span>
        </div>

        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Surface Distance</span>
            <span class="card-icon">📏</span>
          </div>
          <div class="card-value">
            ${formatVal(live?.distanceCm)} <span class="card-unit">cm</span>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">HC-SR04 ultrasonic echo</span>
        </div>

        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Flow Rate</span>
            <span class="card-icon">💧</span>
          </div>
          <div class="card-value">
            ${formatVal(live?.flowRateLpm)} <span class="card-unit">L/m</span>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">YF-S201 pulse meter</span>
        </div>

        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Cumulative Volume</span>
            <span class="card-icon">📊</span>
          </div>
          <div class="card-value">
            ${formatVal(live?.totalLitres)} <span class="card-unit">L</span>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Total consumption counter</span>
        </div>

        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Pump Current</span>
            <span class="card-icon">⚡</span>
          </div>
          <div class="card-value">
            ${formatVal(live?.pumpCurrentA)} <span class="card-unit">A</span>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">ACS712 motor current</span>
        </div>

        <div class="telemetry-card">
          <div class="card-top">
            <span class="card-label">Verified Relay State</span>
            <span class="card-icon">⚙️</span>
          </div>
          <div class="card-value">
            <span class="badge ${live?.pumpState === 'ON' ? 'badge-status' : 'badge-phase'}" style="font-size: 1.1rem; padding: 0.4rem 1rem;">
              <span class="badge-dot"></span> ${live?.pumpState || 'OFF'}
            </span>
          </div>
          <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Physical feedback verification</span>
        </div>
      </div>

      <!-- Pump Supervisory Controls -->
      <div class="control-card">
        <div class="section-header">
          <div>
            <h3 class="section-title"><span class="indicator"></span> Supervisory Pump Controls (${tankId.toUpperCase()})</h3>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.2rem;">
              Admin override authority &bull; Switch mode to MANUAL to dispatch physical pump triggers
            </p>
          </div>
        </div>

        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; margin-top: 1rem;">
          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; text-transform: uppercase;">
              Control Mode
            </label>
            <div class="control-mode-toggle">
              <button class="mode-btn ${state.selectedMode === 'AUTO' ? 'active' : ''}" id="btn-mode-auto">AUTO</button>
              <button class="mode-btn ${state.selectedMode === 'MANUAL' ? 'active' : ''}" id="btn-mode-manual">MANUAL</button>
            </div>
          </div>

          <div>
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; text-transform: uppercase;">
              Pump Actions (Active only in MANUAL)
            </label>
            <div class="pump-action-buttons">
              <button 
                class="btn-action btn-pump-on" 
                id="btn-pump-on" 
                ${state.selectedMode === 'AUTO' || state.commandLoading ? 'disabled' : ''}
              >
                ⚡ Request Pump ON
              </button>
              <button 
                class="btn-action btn-pump-off" 
                id="btn-pump-off" 
                ${state.selectedMode === 'AUTO' || state.commandLoading ? 'disabled' : ''}
              >
                🛑 Request Pump OFF
              </button>
            </div>
          </div>
        </div>

        <!-- Command Acknowledgement & Physical Device Verification -->
        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            <strong>Controller Verification:</strong>
            ${state.lastCommandAck ? `
              <span class="badge ${state.lastCommandAck.status === 'APPLIED' ? 'badge-status' : (state.lastCommandAck.status === 'RECEIVED' ? 'badge-warning' : 'badge-danger')}">
                <span class="badge-dot"></span> ${state.lastCommandAck.status}: ${state.lastCommandAck.reason || (state.lastCommandAck.status === 'APPLIED' ? 'Relay Verified Actuated' : 'Command Received')}
              </span>
            ` : `
              <span class="badge badge-phase"><span class="badge-dot"></span> Standby / Awaiting Commands</span>
            `}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Command ID: <code>${state.lastCommandAck?.commandId || '--'}</code> &bull; Verified Relay: <strong>${live?.pumpState || 'OFF'}</strong>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ----------------------------------------------------
// TAB 4: TANK PROVISIONING & HARDWARE WI-FI SETUP
// ----------------------------------------------------
function renderAdminProvisioningView() {
  const nextTankId = getNextAvailableTankId(state.allTanks, state.allUsers);
  const tankEntries = Object.entries(state.allTanks);

  return `
    <section style="display: flex; flex-direction: column; gap: 1.5rem;">
      <div class="section-header">
        <div>
          <h2 class="section-title"><span class="indicator"></span> Hardware Provisioning &amp; Tank Setup Wizard</h2>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.2rem;">
            Configure building Wi-Fi credentials, register physical tank units, and generate operator login accounts.
          </p>
        </div>
      </div>

      <!-- Feedback notice if any -->
      ${state.provisioningFeedback ? `
        <div class="notice-box notice-${state.provisioningFeedback.type === 'danger' ? 'error' : 'info'}">
          <div class="notice-icon">${state.provisioningFeedback.type === 'danger' ? '⚠️' : '✅'}</div>
          <div class="notice-content">
            <h4>${state.provisioningFeedback.title || (state.provisioningFeedback.type === 'danger' ? 'Setup Error' : 'Setup Successful')}</h4>
            <div style="font-size: 0.85rem; margin-top: 0.25rem;">${state.provisioningFeedback.message}</div>
          </div>
        </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
        
        <!-- CARD 1: Operator Account & Tank Assignment -->
        <div class="form-card">
          <div class="form-header">
            <div class="form-icon">👤</div>
            <div>
              <h3>1. Operator Credentials &amp; Tank Identity</h3>
              <p>Create the designated operator login and assign the physical tank.</p>
            </div>
          </div>

          <form id="form-admin-provision">
            <div class="form-group">
              <label for="prov-tank-id">Assigned Tank ID</label>
              <select id="prov-tank-id" class="form-input">
                <option value="${nextTankId}">Auto: ${nextTankId.toUpperCase()} (Next Available)</option>
                <option value="tank-01">tank-01 — Ground / Sump Tank</option>
                <option value="tank-02">tank-02 — Rooftop / Overhead Tank</option>
                <option value="tank-03">tank-03 — Auxiliary Storage Tank</option>
                <option value="custom">-- Custom Tank ID --</option>
              </select>
              <input type="text" id="prov-custom-tank" class="form-input" placeholder="e.g. tank-04" style="display: none; margin-top: 0.5rem;" />
            </div>

            <div class="form-group">
              <label for="prov-tank-name">Tank Friendly Name</label>
              <input type="text" id="prov-tank-name" class="form-input" placeholder="e.g. Ground Sump Storage Unit" value="Storage Unit ${nextTankId.replace(/^tank-?/i, '').toUpperCase()}" />
            </div>

            <div class="form-group">
              <label for="prov-email">Operator Login Email</label>
              <input type="email" id="prov-email" class="form-input" placeholder="operator@facility.com" required autocomplete="email" />
            </div>

            <div class="form-group">
              <label for="prov-password">Operator Login Password</label>
              <input type="password" id="prov-password" class="form-input" placeholder="Minimum 6 characters" required autocomplete="new-password" />
            </div>

            <div style="border-top: 1px solid var(--border-light); margin: 1.25rem 0; padding-top: 1rem;">
              <div class="form-header" style="margin-bottom: 0.75rem;">
                <div class="form-icon" style="font-size: 1.25rem;">📡</div>
                <div>
                  <h4 style="margin: 0; font-size: 0.95rem;">2. Hardware &amp; Building Wi-Fi Setup</h4>
                  <p style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.15rem;">Push credentials directly to the ESP8266 controller.</p>
                </div>
              </div>

              <div class="form-group">
                <label for="prov-controller-host">Hardware Controller Address</label>
                <div style="display: flex; gap: 0.5rem;">
                  <input type="text" id="prov-controller-host" class="form-input" value="${state.localHostUrl || 'http://192.168.4.1'}" style="flex: 1;" placeholder="http://192.168.4.1" />
                  <button type="button" id="btn-test-hardware" class="btn-secondary" style="padding: 0 0.75rem; white-space: nowrap; font-size: 0.8rem;">
                    🔌 Test Link
                  </button>
                </div>
                <div id="prov-hw-status" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
                  Connect laptop/phone to controller's Wi-Fi hotspot to push directly.
                </div>
              </div>

              <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                  <label style="margin: 0;">Building Wi-Fi Network (2.4 GHz)</label>
                  <button type="button" id="btn-prov-scan" style="background: none; border: none; color: var(--brand-primary); font-size: 0.75rem; font-weight: 700; cursor: pointer;">
                    🔄 Scan Networks
                  </button>
                </div>
                <select id="prov-wifi-ssid-select" class="form-input">
                  <option value="">Select Scanned Network or Type Below</option>
                  ${(state.scannedWifiList || []).map(w => `<option value="${w.ssid}">${w.ssid} (${w.rssi} dBm)</option>`).join('')}
                </select>
                <input type="text" id="prov-wifi-ssid" class="form-input" placeholder="Building Wi-Fi Name (SSID)" style="margin-top: 0.5rem;" />
              </div>

              <div class="form-group">
                <label for="prov-wifi-pass">Building Wi-Fi Password</label>
                <input type="password" id="prov-wifi-pass" class="form-input" placeholder="Enter Router Password" />
              </div>
            </div>

            <button type="submit" class="btn-primary" id="btn-submit-provision" ${state.provisioningLoading ? 'disabled' : ''} style="width: 100%;">
              ${state.provisioningLoading ? 'Deploying &amp; Provisioning...' : '🚀 Create Operator &amp; Configure Tank'}
            </button>
          </form>
        </div>

        <!-- CARD 2: Existing Tanks & Hardware Summary -->
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Quick Wi-Fi Reconfiguration Card for Existing Tanks -->
          <div class="form-card">
            <div class="form-header">
              <div class="form-icon">📶</div>
              <div>
                <h3>Quick Hardware Wi-Fi Push</h3>
                <p>Update building Wi-Fi password for an already-registered controller without touching user accounts.</p>
              </div>
            </div>

            <form id="form-quick-wifi">
              <div class="form-group">
                <label for="quick-tank-id">Target Tank</label>
                <select id="quick-tank-id" class="form-input">
                  ${tankEntries.length > 0 ? tankEntries.map(([id, t]) => `
                    <option value="${id}">${(t.name || id).toUpperCase()} (${id})</option>
                  `).join('') : '<option value="tank-01">TANK-01</option>'}
                </select>
              </div>

              <div class="form-group">
                <label for="quick-ssid">Building Wi-Fi SSID</label>
                <input type="text" id="quick-ssid" class="form-input" placeholder="Building Wi-Fi Name" required />
              </div>

              <div class="form-group">
                <label for="quick-pass">Wi-Fi Password</label>
                <input type="password" id="quick-pass" class="form-input" placeholder="Router Password" required />
              </div>

              <button type="submit" class="btn-secondary" id="btn-quick-wifi" style="width: 100%;">
                💾 Push Wi-Fi to Controller (192.168.4.1)
              </button>
            </form>
          </div>

          <!-- Provisioning Best Practices Help Box -->
          <div class="notice-box notice-info">
            <div class="notice-icon">💡</div>
            <div class="notice-content">
              <h4>Foolproof Multi-Tank Deployment Guide</h4>
              <ul style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.35rem; padding-left: 1.2rem; line-height: 1.6;">
                <li><strong>No Confusion:</strong> Each tank has an isolated identity (<code>tank-01</code>, <code>tank-02</code>).</li>
                <li><strong>One Identity:</strong> The operator's email is permanently mapped in Firebase to their designated tank.</li>
                <li><strong>Automatic Hardware Sync:</strong> When you click Deploy, the controller is flashed via Wi-Fi with its assigned Tank ID and connects to the building router immediately.</li>
                <li><strong>Zero Local Setup Needed:</strong> Operators simply log into the web dashboard with their email &amp; password!</li>
              </ul>
            </div>
          </div>

        </div>

      </div>
    </section>
  `;
}

// ==========================================
// OPERATOR DASHBOARD VIEW (LIGHT THEME)
// ==========================================
function renderOperatorDashboard() {
  const tankId = state.profile?.assignedTankId || 'tank-01';
  const live = state.activeTankLive;
  const isStale = live?.updatedAt ? isTelemetryStale(live.updatedAt) : true;

  const formatVal = (v, suffix = '', fallback = '--') => {
    return (v !== null && v !== undefined) ? `${v}${suffix}` : fallback;
  };

  app.innerHTML = `
    <!-- Header Card -->
    <header class="header-card">
      <div class="header-top">
        <span class="badge badge-phase"><span class="badge-dot"></span> Dedicated Operator Portal</span>
        <span id="connection-badge" class="badge ${state.connectionMode === 'local' ? (state.dbConnected ? 'badge-local' : 'badge-danger') : (state.dbConnected ? 'badge-status' : 'badge-danger')}">
          <span class="badge-dot"></span> ${state.connectionMode === 'local' ? (state.dbConnected ? 'Direct Local Link: Online' : 'Direct Link: Disconnected') : (state.dbConnected ? 'Realtime DB: Online' : 'Realtime DB: Offline')}
        </span>
      </div>
      <div class="title-container">
        <h1>Assigned Unit: ${tankId.toUpperCase()}</h1>
        <p>Live water telemetry monitoring and verified pump control for your designated storage unit.</p>
      </div>
    </header>

    <!-- User Account Strip -->
    <div class="user-bar">
      <div class="user-info">
        <span>Operator: <strong class="user-email">${state.user.email}</strong></span>
        <span class="badge badge-status">UNIT: ${tankId.toUpperCase()}</span>
        ${state.connectionMode === 'local' ? `
          <span class="badge badge-local">
            <span class="badge-dot"></span> DIRECT ESP8266 LINK (${state.localHostUrl})
          </span>
        ` : `
          <span class="badge ${isStale ? 'badge-warning' : 'badge-status'}">
            <span class="badge-dot"></span> ${isStale ? 'Data Stale (>60s)' : 'Telemetry Fresh'}
          </span>
        `}
      </div>
      <button class="btn-signout" id="btn-logout">Sign Out</button>
    </div>

    <!-- Feedback notice -->
    ${state.commandFeedback ? `
      <div class="notice-box notice-${state.commandFeedback.type === 'danger' ? 'error' : 'info'}">
        <div class="notice-icon">${state.commandFeedback.type === 'danger' ? '⚠️' : '✅'}</div>
        <div class="notice-content">
          <h4>${state.commandFeedback.type === 'danger' ? 'Command Denied' : 'Command Dispatched'}</h4>
          <p>${state.commandFeedback.message}</p>
        </div>
      </div>
    ` : ''}

    <!-- Telemetry Cards Grid -->
    <div class="telemetry-grid">
      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Water Level</span>
          <span class="card-icon">🌊</span>
        </div>
        <div class="card-value">
          ${formatVal(live?.levelPercent)} <span class="card-unit">%</span>
        </div>
        <div class="level-bar-track">
          <div class="level-bar-fill" style="width: ${live?.levelPercent ? Math.min(100, Math.max(0, live.levelPercent)) : 0}%;"></div>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Assigned tank volume</span>
      </div>

      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Surface Distance</span>
          <span class="card-icon">📏</span>
        </div>
        <div class="card-value">
          ${formatVal(live?.distanceCm)} <span class="card-unit">cm</span>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Ultrasonic measurement</span>
      </div>

      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Flow Rate</span>
          <span class="card-icon">💧</span>
        </div>
        <div class="card-value">
          ${formatVal(live?.flowRateLpm)} <span class="card-unit">L/m</span>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Flow sensor output</span>
      </div>

      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Cumulative Volume</span>
          <span class="card-icon">📊</span>
        </div>
        <div class="card-value">
          ${formatVal(live?.totalLitres)} <span class="card-unit">L</span>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Accumulated total</span>
      </div>

      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Pump Current</span>
          <span class="card-icon">⚡</span>
        </div>
        <div class="card-value">
          ${formatVal(live?.pumpCurrentA)} <span class="card-unit">A</span>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Current sensor</span>
      </div>

      <div class="telemetry-card">
        <div class="card-top">
          <span class="card-label">Pump Relay</span>
          <span class="card-icon">⚙️</span>
        </div>
        <div class="card-value">
          <span class="badge ${live?.pumpState === 'ON' ? 'badge-status' : 'badge-phase'}" style="font-size: 1.1rem; padding: 0.4rem 1rem;">
            <span class="badge-dot"></span> ${live?.pumpState || 'OFF'}
          </span>
        </div>
        <span style="font-size: 0.775rem; color: var(--text-muted); margin-top: 0.5rem;">Verified physical state</span>
      </div>
    </div>

    <!-- Pump Operator Controls -->
    <div class="control-card">
      <div class="section-header">
        <div>
          <h3 class="section-title"><span class="indicator"></span> Pump Controls for ${tankId.toUpperCase()}</h3>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.2rem;">
            You have operator authority for this storage unit. Switch to MANUAL to command the pump.
          </p>
        </div>
      </div>

      <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; margin-top: 1rem;">
        <div>
          <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; text-transform: uppercase;">
            Operating Mode
          </label>
          <div class="control-mode-toggle">
            <button class="mode-btn ${state.selectedMode === 'AUTO' ? 'active' : ''}" id="btn-mode-auto">AUTO</button>
            <button class="mode-btn ${state.selectedMode === 'MANUAL' ? 'active' : ''}" id="btn-mode-manual">MANUAL</button>
          </div>
        </div>

        <div>
          <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.35rem; text-transform: uppercase;">
            Manual Action Triggers
          </label>
          <div class="pump-action-buttons">
            <button 
              class="btn-action btn-pump-on" 
              id="btn-pump-on" 
              ${state.selectedMode === 'AUTO' || state.commandLoading ? 'disabled' : ''}
            >
              ⚡ Request Pump ON
            </button>
            <button 
              class="btn-action btn-pump-off" 
              id="btn-pump-off" 
              ${state.selectedMode === 'AUTO' || state.commandLoading ? 'disabled' : ''}
            >
              🛑 Request Pump OFF
            </button>
          </div>
        </div>

        <!-- Command Acknowledgement & Physical Device Verification -->
        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            <strong>Controller Verification:</strong>
            ${state.lastCommandAck ? `
              <span class="badge ${state.lastCommandAck.status === 'APPLIED' ? 'badge-status' : (state.lastCommandAck.status === 'RECEIVED' ? 'badge-warning' : 'badge-danger')}">
                <span class="badge-dot"></span> ${state.lastCommandAck.status}: ${state.lastCommandAck.reason || (state.lastCommandAck.status === 'APPLIED' ? 'Relay Verified Actuated' : 'Command Received')}
              </span>
            ` : `
              <span class="badge badge-phase"><span class="badge-dot"></span> Standby / Awaiting Commands</span>
            `}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Command ID: <code>${state.lastCommandAck?.commandId || '--'}</code> &bull; Verified Relay: <strong>${live?.pumpState || 'OFF'}</strong>
          </div>
        </div>
      </div>
    </div>

    <footer>
      <p>Smart Water Tank Monitoring System &bull; Dedicated Operator View &bull; Unit: ${tankId.toUpperCase()}</p>
    </footer>
  `;

  attachOperatorEventListeners(tankId);
}

// ==========================================
// EVENT LISTENERS & ACTION HANDLERS
// ==========================================
function attachAdminEventListeners() {
  // Sign out
  document.querySelector('#btn-logout')?.addEventListener('click', async () => {
    if (state.connectionMode === 'local') {
      if (state.localPollInterval) {
        clearInterval(state.localPollInterval);
        state.localPollInterval = null;
      }
      state.user = null;
      state.profile = null;
      state.activeTankLive = null;
      render();
    } else {
      await logoutUser();
    }
  });

  // Admin Navigation Tabs
  document.querySelector('#tab-admin-fleet')?.addEventListener('click', () => {
    state.adminTab = 'fleet';
    render();
  });
  document.querySelector('#tab-admin-operators')?.addEventListener('click', () => {
    state.adminTab = 'operators';
    render();
  });
  document.querySelector('#tab-admin-setup')?.addEventListener('click', () => {
    state.adminTab = 'setup';
    render();
  });
  document.querySelector('#tab-admin-control')?.addEventListener('click', () => {
    state.adminTab = 'control';
    render();
  });

  // Fleet View Interactions
  if (state.adminTab === 'fleet') {
    // Search input
    const searchInput = document.querySelector('#fleet-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.fleetSearchQuery = e.target.value;
        render();
        // Restore focus to search input
        const reInput = document.querySelector('#fleet-search-input');
        if (reInput) {
          reInput.focus();
          reInput.setSelectionRange(reInput.value.length, reInput.value.length);
        }
      });
    }

    // Filter pills
    document.querySelector('#filter-all')?.addEventListener('click', () => {
      state.fleetFilter = 'all';
      render();
    });
    document.querySelector('#filter-running')?.addEventListener('click', () => {
      state.fleetFilter = 'running';
      render();
    });
    document.querySelector('#filter-low')?.addEventListener('click', () => {
      state.fleetFilter = 'low';
      render();
    });

    // Inspect buttons on each tank card
    document.querySelectorAll('.btn-inspect-tank').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tankId = e.currentTarget.getAttribute('data-tank-id');
        if (tankId) {
          state.selectedAdminTankId = tankId;
          state.adminTab = 'control';
          clearListeners();
          initListeners();
          render();
        }
      });
    });
  }

  // Operator Registration Form
  if (state.adminTab === 'operators') {
    const createForm = document.querySelector('#create-operator-form');
    if (createForm) {
      createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.querySelector('#op-email').value;
        const password = document.querySelector('#op-password').value;
        const tankId = document.querySelector('#op-tank-id').value;
        const tankName = document.querySelector('#op-tank-name').value;

        state.userCreationLoading = true;
        state.userCreationFeedback = null;
        render();

        try {
          const result = await createOperatorUser(email, password, tankId, tankName);
          state.userCreationFeedback = {
            type: 'info',
            message: `Operator ${result.email} successfully registered and bound to ${result.tankId.toUpperCase()} (${result.tankName})!`
          };
        } catch (err) {
          state.userCreationFeedback = {
            type: 'danger',
            message: err.message || 'Failed to create operator user.'
          };
        } finally {
          state.userCreationLoading = false;
          render();
        }
      });
    }

    // Delete Operator Buttons
    document.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const uid = e.currentTarget.getAttribute('data-uid');
        const tankId = e.currentTarget.getAttribute('data-tank-id');
        if (confirm(`Are you sure you want to remove this operator account?`)) {
          try {
            await deleteOperatorUser(uid, tankId);
          } catch (err) {
            alert('Failed to remove user: ' + err.message);
          }
        }
      });
    });
  }

  // Tank Provisioning & Hardware Wi-Fi Setup Wizard
  if (state.adminTab === 'setup') {
    const tankSelect = document.querySelector('#prov-tank-id');
    const customTankInput = document.querySelector('#prov-custom-tank');
    const tankNameInput = document.querySelector('#prov-tank-name');
    const hostInput = document.querySelector('#prov-controller-host');
    const ssidSelect = document.querySelector('#prov-wifi-ssid-select');
    const ssidInput = document.querySelector('#prov-wifi-ssid');

    // 1. Tank ID dropdown selection handler
    if (tankSelect) {
      tankSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          if (customTankInput) customTankInput.style.display = 'block';
        } else {
          if (customTankInput) customTankInput.style.display = 'none';
          if (tankNameInput && val) {
            const cleanNum = val.replace(/^tank-?/i, '');
            tankNameInput.value = `Water Storage Unit ${cleanNum.toUpperCase()}`;
          }
        }
      });
    }

    // 2. Wi-Fi SSID dropdown selection handler
    if (ssidSelect && ssidInput) {
      ssidSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          ssidInput.value = e.target.value;
        }
      });
    }

    // 3. Hardware Test Connection button
    const testHwBtn = document.querySelector('#btn-test-hardware');
    const hwStatus = document.querySelector('#prov-hw-status');
    if (testHwBtn && hwStatus) {
      testHwBtn.addEventListener('click', async () => {
        const host = hostInput?.value?.trim() || state.localHostUrl || 'http://192.168.4.1';
        testHwBtn.disabled = true;
        testHwBtn.textContent = '⏳ Probing...';
        hwStatus.innerHTML = `<span style="color: var(--text-secondary);">Connecting to ${host}...</span>`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(`${host}/api/live`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            hwStatus.innerHTML = `<span style="color: #059669; font-weight: 600;">✅ Connected! Controller active for Tank: ${data.tankId || 'detected'} (${data.deviceUid || 'ESP8266'}) &bull; Water Level: ${data.levelPercent !== null && data.levelPercent !== undefined ? data.levelPercent + '%' : '--'}</span>`;
          } else {
            hwStatus.innerHTML = `<span style="color: #dc2626;">⚠️ Controller replied with HTTP ${res.status}</span>`;
          }
        } catch (err) {
          hwStatus.innerHTML = `<span style="color: #dc2626;">⚠️ Cannot reach controller at ${host}. Connect your laptop/phone to the <strong>SmartWaterTank-Setup</strong> hotspot (192.168.4.1).</span>`;
        } finally {
          testHwBtn.disabled = false;
          testHwBtn.textContent = '🔌 Test Link';
        }
      });
    }

    // 4. Scan Wi-Fi Networks button
    const scanBtn = document.querySelector('#btn-prov-scan');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        const host = hostInput?.value?.trim() || state.localHostUrl || 'http://192.168.4.1';
        scanBtn.disabled = true;
        scanBtn.textContent = '🔄 Scanning...';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`${host}/api/scan-wifi`, { credentials: 'omit', signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const networks = await res.json();
            if (Array.isArray(networks)) {
              state.scannedWifiList = networks;
              if (ssidSelect) {
                ssidSelect.innerHTML = `<option value="">Select Scanned Network (${networks.length} found)</option>` +
                  networks.map(w => `<option value="${w.ssid}">${w.ssid} (${w.rssi} dBm)</option>`).join('');
              }
              scanBtn.textContent = `✅ ${networks.length} Found`;
            }
          } else {
            alert(`Controller Wi-Fi scan returned HTTP ${res.status}`);
            scanBtn.textContent = '🔄 Scan Networks';
          }
        } catch (err) {
          alert(`Wi-Fi scan failed: Ensure your device is connected to the controller's hotspot (${host}). Error: ` + err.message);
          scanBtn.textContent = '🔄 Scan Networks';
        } finally {
          scanBtn.disabled = false;
        }
      });
    }

    // 5. Submit Provisioning & Tank Setup Form
    const provForm = document.querySelector('#form-admin-provision');
    if (provForm) {
      provForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let selectedTank = tankSelect?.value || 'tank-01';
        if (selectedTank === 'custom') {
          selectedTank = customTankInput?.value?.trim().toLowerCase() || 'tank-01';
          if (!selectedTank.startsWith('tank-')) {
            selectedTank = 'tank-' + selectedTank;
          }
        }
        const tankName = tankNameInput?.value?.trim() || `Water Storage Unit ${selectedTank.replace(/^tank-?/i, '').toUpperCase()}`;
        const email = document.querySelector('#prov-email')?.value?.trim();
        const password = document.querySelector('#prov-password')?.value;
        const host = hostInput?.value?.trim() || state.localHostUrl || 'http://192.168.4.1';
        const wifiSsid = ssidInput?.value?.trim() || ssidSelect?.value?.trim();
        const wifiPass = document.querySelector('#prov-wifi-pass')?.value || '';

        state.provisioningLoading = true;
        state.provisioningFeedback = null;
        render();

        let opSuccess = false;
        let wifiPushed = false;
        let opError = null;
        let wifiError = null;

        // Step 1: Create Operator User in Firebase
        try {
          await createOperatorUser(email, password, selectedTank, tankName);
          opSuccess = true;
        } catch (err) {
          opError = err.message || 'Failed to create operator user.';
        }

        // Step 2: Push Wi-Fi credentials to ESP8266 controller if SSID provided
        if (wifiSsid) {
          try {
            const params = new URLSearchParams();
            params.append('ssid', wifiSsid);
            params.append('pass', wifiPass);
            params.append('tankId', selectedTank);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const wifiRes = await fetch(`${host}/api/wifi-setup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (wifiRes.ok) {
              wifiPushed = true;
            } else {
              wifiError = `Controller HTTP ${wifiRes.status}`;
            }
          } catch (err) {
            wifiError = err.message || 'Controller unreachable';
          }
        }

        // Prepare outcome feedback
        if (opSuccess) {
          let msg = `Operator <strong>${email}</strong> has been registered in Firebase and assigned to <strong>${selectedTank.toUpperCase()}</strong> (${tankName}).`;
          if (wifiPushed) {
            msg += `<br>📶 <strong>Building Wi-Fi Configured:</strong> Wi-Fi credentials for "<em>${wifiSsid}</em>" and Tank ID "<em>${selectedTank}</em>" pushed to controller. Hardware will restart and connect to Firebase automatically!`;
          } else if (wifiSsid && wifiError) {
            msg += `<br>⚠️ <strong>Hardware Wi-Fi Notice:</strong> Operator created in Firebase, but could not push Wi-Fi to controller (${wifiError}). Connect your device to the controller AP (192.168.4.1) and use the Quick Wi-Fi Push form or embedded setup page.`;
          } else {
            msg += `<br>ℹ️ Operator login is ready. Controller Wi-Fi can be synced whenever connected to the setup hotspot.`;
          }

          state.provisioningFeedback = {
            type: 'info',
            title: 'Provisioning Successful',
            message: msg
          };
        } else {
          state.provisioningFeedback = {
            type: 'danger',
            title: 'Provisioning Failed',
            message: `Could not create operator account: ${opError}`
          };
        }

        state.provisioningLoading = false;
        render();
      });
    }

    // 6. Quick Hardware Wi-Fi Push for Existing Tanks
    const quickForm = document.querySelector('#form-quick-wifi');
    if (quickForm) {
      quickForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetTank = document.querySelector('#quick-tank-id')?.value || 'tank-01';
        const ssid = document.querySelector('#quick-ssid')?.value?.trim();
        const pass = document.querySelector('#quick-pass')?.value || '';
        const host = hostInput?.value?.trim() || state.localHostUrl || 'http://192.168.4.1';

        const quickBtn = document.querySelector('#btn-quick-wifi');
        if (quickBtn) {
          quickBtn.disabled = true;
          quickBtn.textContent = 'Pushing to Controller...';
        }

        try {
          const params = new URLSearchParams();
          params.append('ssid', ssid);
          params.append('pass', pass);
          params.append('tankId', targetTank);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`${host}/api/wifi-setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            state.provisioningFeedback = {
              type: 'info',
              title: 'Hardware Wi-Fi Configured',
              message: `✅ Successfully flashed building Wi-Fi "<em>${ssid}</em>" and Tank ID "<em>${targetTank.toUpperCase()}</em>" to ESP8266 controller! Controller will reboot and connect to Firebase automatically.`
            };
          } else {
            const errTxt = await res.text();
            throw new Error(`Controller HTTP ${res.status}: ${errTxt || res.statusText}`);
          }
        } catch (err) {
          state.provisioningFeedback = {
            type: 'danger',
            title: 'Hardware Wi-Fi Push Failed',
            message: `⚠️ Could not reach controller at ${host}. Make sure you are connected to the controller's Wi-Fi hotspot (e.g. <em>SmartWaterTank-Setup</em>). Error: ${err.message}`
          };
        } finally {
          render();
        }
      });
    }
  }

  // Tank Inspector Controls
  if (state.adminTab === 'control') {
    // Tank switcher dropdown
    const picker = document.querySelector('#tank-picker');
    if (picker) {
      picker.addEventListener('change', (e) => {
        state.selectedAdminTankId = e.target.value;
        clearListeners();
        initListeners();
        render();
      });
    }

    // Mode Toggle: AUTO
    document.querySelector('#btn-mode-auto')?.addEventListener('click', async () => {
      state.selectedMode = 'AUTO';
      await dispatchCommand(state.selectedAdminTankId, 'AUTO', 'OFF');
    });

    // Mode Toggle: MANUAL
    document.querySelector('#btn-mode-manual')?.addEventListener('click', async () => {
      state.selectedMode = 'MANUAL';
      const currentPumpState = state.activeTankLive?.pumpState || 'OFF';
      await dispatchCommand(state.selectedAdminTankId, 'MANUAL', currentPumpState);
    });

    // Pump Action: ON
    document.querySelector('#btn-pump-on')?.addEventListener('click', async () => {
      await dispatchCommand(state.selectedAdminTankId, 'MANUAL', 'ON');
    });

    // Pump Action: OFF
    document.querySelector('#btn-pump-off')?.addEventListener('click', async () => {
      await dispatchCommand(state.selectedAdminTankId, 'MANUAL', 'OFF');
    });
  }
}

function attachOperatorEventListeners(tankId) {
  // Sign out
  document.querySelector('#btn-logout')?.addEventListener('click', async () => {
    if (state.connectionMode === 'local') {
      if (state.localPollInterval) {
        clearInterval(state.localPollInterval);
        state.localPollInterval = null;
      }
      state.user = null;
      state.profile = null;
      state.activeTankLive = null;
      render();
    } else {
      await logoutUser();
    }
  });

  // Mode Toggle: AUTO
  document.querySelector('#btn-mode-auto')?.addEventListener('click', async () => {
    state.selectedMode = 'AUTO';
    await dispatchCommand(tankId, 'AUTO', 'OFF');
  });

  // Mode Toggle: MANUAL
  document.querySelector('#btn-mode-manual')?.addEventListener('click', async () => {
    state.selectedMode = 'MANUAL';
    const currentPumpState = state.activeTankLive?.pumpState || 'OFF';
    await dispatchCommand(tankId, 'MANUAL', currentPumpState);
  });

  // Pump Action: ON
  document.querySelector('#btn-pump-on')?.addEventListener('click', async () => {
    await dispatchCommand(tankId, 'MANUAL', 'ON');
  });

  // Pump Action: OFF
  document.querySelector('#btn-pump-off')?.addEventListener('click', async () => {
    await dispatchCommand(tankId, 'MANUAL', 'OFF');
  });
}

async function dispatchCommand(tankId, requestedMode, requestedPumpState) {
  state.commandLoading = true;
  state.commandFeedback = null;
  render();

  try {
    if (state.connectionMode === 'local') {
      const params = new URLSearchParams();
      params.append('email', state.user?.email || '');
      params.append('uid', state.user?.uid || '');
      params.append('role', state.profile?.role || 'operator');
      params.append('tankId', tankId);
      params.append('mode', requestedMode);
      params.append('pumpState', requestedPumpState);

      const res = await fetch(`${state.localHostUrl}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Controller HTTP ${res.status}: ${text || res.statusText}`);
      }

      const resData = await res.json();
      if (resData.success === false) {
        throw new Error(resData.reason || 'Command rejected by controller safety lock');
      }

      state.commandFeedback = {
        type: 'info',
        message: `Local Command Applied: Mode=${resData.controlMode || requestedMode}, Pump=${resData.pumpState || requestedPumpState}`
      };

      // Immediately refresh local telemetry
      try {
        const liveRes = await fetch(`${state.localHostUrl}/api/live`);
        if (liveRes.ok) {
          state.activeTankLive = await liveRes.json();
        }
      } catch (e) { /* ignore periodic poll hiccup */ }
    } else {
      const result = await submitTankCommand(
        tankId,
        { requestedMode, requestedPumpState },
        state.user,
        state.profile
      );
      state.commandFeedback = {
        type: 'info',
        message: `Command verified & dispatched: Mode=${requestedMode}, Pump=${requestedPumpState} (ID: ${result.commandId})`
      };
    }
  } catch (err) {
    state.commandFeedback = {
      type: 'danger',
      message: err.message || 'Command dispatch failed.'
    };
  } finally {
    state.commandLoading = false;
    render();
  }
}

// ==========================================
// APPLICATION BOOTSTRAP
// ==========================================
subscribeToAuthState((user, profile) => {
  state.user = user;
  state.profile = profile;
  state.authLoading = false;
  state.authError = null;

  if (user) {
    initListeners();
  } else {
    clearListeners();
    state.allTanks = {};
    state.allUsers = {};
    state.activeTankLive = null;
  }

  render();
});

render();
