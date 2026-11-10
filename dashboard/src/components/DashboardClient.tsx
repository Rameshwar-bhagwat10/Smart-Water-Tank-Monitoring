'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './Header';
import HeroWaterLevelCard from './HeroWaterLevelCard';
import ControlModeCard from './ControlModeCard';
import WaterLevelChart from './WaterLevelChart';
import MetricsGrid from './MetricsGrid';
import FlowSparklineChart from './FlowSparklineChart';
import CurrentGaugeCard from './CurrentGaugeCard';
import ActivityTimeline from './ActivityTimeline';
import FooterSpecs from './FooterSpecs';
import LoginView from './LoginView';
import { playWebBuzzer } from './AudioBuzzer';

import { onAuthChange, logout } from '../firebase/auth';
import { listenToTelemetry, sendCommand, ensureUserAndTankData } from '../firebase/database';
import { isConfigured, configError } from '../firebase/config';
import type { User } from 'firebase/auth';
import type {
  TelemetryData,
  ControlMode,
  PumpState,
  ActivityEvent,
} from '../types/tank';

const MAX_HISTORY = 60;
const DEFAULT_TANK_ID = 'tank-01';

interface DashboardClientProps {
  initialTelemetry?: TelemetryData | null;
  initialTankId?: string;
}

export default function DashboardClient({
  initialTelemetry = null,
  initialTankId = DEFAULT_TANK_ID,
}: DashboardClientProps) {
  // Auth & Tank State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState('operator');
  const [activeTankId, setActiveTankId] = useState<string>(initialTankId);
  const [isInitializing, setIsInitializing] = useState(true);

  // Telemetry state initialized with ISR server-provided initialTelemetry for 0ms initial render
  const [telemetry, setTelemetry] = useState<TelemetryData>(
    initialTelemetry || {
      levelPercent: -1,
      distanceCm: -1,
      flowRateLpm: 0,
      totalLitres: 0,
      pumpCurrentA: 0,
      pumpState: 'OFF',
      controlMode: 'AUTO',
      controllerStatus: 'Standby',
    }
  );
  const [syncLatency, setSyncLatency] = useState('Cloud RTDB');
  const [statusText, setStatusText] = useState('');

  // Rolling Histories
  const [levelHistory, setLevelHistory] = useState<number[]>(() => {
    const initLvl = initialTelemetry?.levelPercent ?? -1;
    return initLvl >= 0 ? [initLvl] : [];
  });
  const [flowHistory, setFlowHistory] = useState<number[]>(() => {
    const initFlow = initialTelemetry?.flowRateLpm ?? 0;
    return initFlow >= 0 ? [initFlow] : [];
  });
  const [peakCurrent, setPeakCurrent] = useState(0);
  const [avgCurrent, setAvgCurrent] = useState(0);

  // Stats accumulators in refs to avoid re-render loops
  const curStatsRef = useRef({ sum: 0, count: 0, peak: 0 });

  // Optimistic In-Flight Buffers
  const optimisticPumpRef = useRef<PumpState | null>(null);
  const optimisticPumpExpiresRef = useRef(0);
  const optimisticModeRef = useRef<ControlMode | null>(null);
  const optimisticModeExpiresRef = useRef(0);

  // Audio / Alarm Tracker Refs
  const lastPumpRef = useRef<string>('');
  const lastStateRef = useRef<string>('');
  const lastWaterProbeRef = useRef<boolean>(false);
  const lastFullTankAlarmWebMsRef = useRef(0);
  const lastDeviceIpRef = useRef<string>('');

  // Timeline Events
  const [events, setEvents] = useState<ActivityEvent[]>([
    {
      msg: 'Cloud dashboard connected (Next.js SSR/ISR)',
      color: '#D4F63D',
      ts: new Date().toLocaleTimeString('en-US', { hour12: false }),
    },
  ]);

  const addEvent = useCallback((msg: string, color: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour12: false });
    setEvents((prev) => [{ msg, color, ts }, ...prev.slice(0, 7)]);
  }, []);

  // 1. Firebase Auth Lifecycle Listener
  useEffect(() => {
    const unsubscribe = onAuthChange(async (user: User | null) => {
      setCurrentUser(user);
      if (user) {
        try {
          const res = await ensureUserAndTankData(user.uid, user.email || '');
          if (res) {
            if (res.tankId) setActiveTankId(res.tankId);
            if (res.profile?.role) setUserRole(res.profile.role);
          }
        } catch (e) {
          console.error('[Auth Sync] Error:', e);
        }
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-Time Telemetry Listener (WebSocket sub-millisecond streaming)
  useEffect(() => {
    if (!currentUser || !activeTankId) return;

    const unsubscribe = listenToTelemetry(activeTankId, (raw: Record<string, unknown> | null) => {
      if (!raw) return;

      if (typeof raw.deviceIp === 'string') lastDeviceIpRef.current = raw.deviceIp;
      else if (typeof raw.ip === 'string') lastDeviceIpRef.current = raw.ip;

      // Extract real sensor reading
      let level = parseFloat(String(raw.levelPercent ?? raw.level ?? -1));
      let distance = parseFloat(String(raw.distanceCm ?? raw.distance ?? -1));
      const flow = parseFloat(String(raw.flowRateLpm ?? raw.flow ?? 0));
      const total = parseFloat(String(raw.totalLitres ?? raw.total ?? 0));
      const current = parseFloat(String(raw.pumpCurrentA ?? raw.current ?? 0));
      let pump: PumpState = raw.pumpState === 'ON' || raw.pump === 'ON' ? 'ON' : 'OFF';
      let mode: ControlMode = raw.controlMode === 'MANUAL' || raw.mode === 'MANUAL' ? 'MANUAL' : 'AUTO';

      // Ultrasonic sensor real reading handling:
      // If sensor times out or has no reading (level < 0 or distance < 0), display as standby/unmeasured
      // NEVER falsely force 100% when there is no target!
      if (distance < 0 || level < 0) {
        level = -1;
        distance = -1;
      } else if (level > 100.0) {
        level = 100.0;
      }

      // Check optimistic pump lockout
      const now = Date.now();
      if (optimisticPumpRef.current !== null && now < optimisticPumpExpiresRef.current) {
        if (pump === optimisticPumpRef.current) {
          optimisticPumpRef.current = null;
        } else {
          pump = optimisticPumpRef.current;
        }
      } else {
        optimisticPumpRef.current = null;
      }

      // Check optimistic mode lockout
      if (optimisticModeRef.current !== null && now < optimisticModeExpiresRef.current) {
        if (mode === optimisticModeRef.current) {
          optimisticModeRef.current = null;
        } else {
          mode = optimisticModeRef.current;
        }
      } else {
        optimisticModeRef.current = null;
      }

      const status = String(raw.controllerStatus ?? raw.status ?? 'Standby');
      const waterProbe = raw.waterProbe === true || raw.waterProbe === 1 || raw.waterProbe === 'true';
      const rawAdc = typeof raw.rawAdc === 'number' || typeof raw.rawAdc === 'string' ? raw.rawAdc : '--';

      // Update state
      setTelemetry({
        levelPercent: level,
        distanceCm: distance,
        flowRateLpm: flow,
        totalLitres: total,
        pumpCurrentA: current,
        pumpState: pump,
        controlMode: mode,
        controllerStatus: status,
        waterProbe: waterProbe,
        rawAdc: rawAdc,
        lastUpdatedTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
      });

      // Update level history
      setLevelHistory((prev) => {
        const val = level >= 0 ? level : 0;
        const next = [...prev, val];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });

      // Update flow history
      setFlowHistory((prev) => {
        const val = flow >= 0 ? flow : 0;
        const next = [...prev, val];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });

      // Current stats
      const cVal = current >= 0 ? current : 0;
      const stats = curStatsRef.current;
      if (cVal > stats.peak) stats.peak = cVal;
      stats.sum += cVal;
      stats.count += 1;
      setPeakCurrent(stats.peak);
      setAvgCurrent(stats.count ? stats.sum / stats.count : 0);

      // Sound buzzer alarm if level >= 95% AND water probe detects water
      if (level >= 95.0 && waterProbe) {
        if (now - lastFullTankAlarmWebMsRef.current >= 3500) {
          lastFullTankAlarmWebMsRef.current = now;
          playWebBuzzer(2500, 200);
          setTimeout(() => playWebBuzzer(2500, 200), 280);
        }
      }

      // Timeline events & buzzer audio on state changes
      if (lastPumpRef.current !== pump && lastPumpRef.current !== '') {
        if (pump === 'ON') {
          addEvent('Pump started', '#D4F63D');
          playWebBuzzer(2500, 250);
        } else if (lastPumpRef.current === 'ON') {
          addEvent('Pump stopped', '#FF4757');
          playWebBuzzer(2500, 150);
        }
      }
      lastPumpRef.current = pump;

      if (waterProbe && !lastWaterProbeRef.current) {
        playWebBuzzer(2000, 150);
        setTimeout(() => playWebBuzzer(2000, 150), 180);
      }
      lastWaterProbeRef.current = waterProbe;

      if (lastStateRef.current !== status && lastStateRef.current !== '') {
        const isOkState =
          status === 'Normal' ||
          status === 'IDLE' ||
          status === 'AUTO_FILLING' ||
          status === 'MANUAL_FILLING';
        addEvent(`State → ${status}`, isOkState ? '#D4F63D' : '#FFA928');
      }
      lastStateRef.current = status;
    });

    return () => unsubscribe();
  }, [currentUser, activeTankId, addEvent]);

  // Fast Dual-Channel Actuation: Mode Toggle
  const handleSetMode = async (newMode: ControlMode) => {
    if (!currentUser) return;
    playWebBuzzer(2700, 150);

    setStatusText(`Setting ${newMode}...`);
    setSyncLatency('Switching 0ms');

    // Optimistic UI update (<1ms)
    optimisticModeRef.current = newMode;
    optimisticModeExpiresRef.current = Date.now() + 3500;
    setTelemetry((prev) => ({ ...prev, controlMode: newMode }));

    // Parallel fast LAN actuation
    const targets: string[] = [];
    if (lastDeviceIpRef.current) {
      targets.push(`http://${lastDeviceIpRef.current}/api/command?mode=${newMode}&_t=${Date.now()}`);
    }
    targets.push(`http://192.168.4.1/api/command?mode=${newMode}&_t=${Date.now()}`);
    targets.forEach((u) => fetch(u, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}));

    try {
      const t0 = performance.now();
      const currentPump = telemetry.pumpState === 'ON' ? 'ON' : 'OFF';
      await sendCommand(activeTankId, currentUser.uid, newMode, currentPump);
      const elapsed = Math.round(performance.now() - t0);
      setSyncLatency(`Synced ${elapsed}ms`);
      setStatusText('');
      addEvent(`Mode → ${newMode}`, '#AF52DE');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`Error: ${msg}`);
      optimisticModeRef.current = null;
    }
  };

  // Fast Dual-Channel Actuation: Pump Start/Stop
  const handleSetPump = async (newState: PumpState) => {
    if (!currentUser) return;
    playWebBuzzer(2500, newState === 'ON' ? 250 : 120);

    setStatusText(`Pump ${newState}...`);
    setSyncLatency('Actuating 0ms');

    // Optimistic UI update (<1ms)
    optimisticPumpRef.current = newState;
    optimisticPumpExpiresRef.current = Date.now() + 3500;
    optimisticModeRef.current = 'MANUAL';
    optimisticModeExpiresRef.current = Date.now() + 3500;
    lastPumpRef.current = newState;
    setTelemetry((prev) => ({ ...prev, pumpState: newState, controlMode: 'MANUAL' }));

    // Parallel fast LAN actuation
    const targets: string[] = [];
    if (lastDeviceIpRef.current) {
      targets.push(`http://${lastDeviceIpRef.current}/api/command?mode=MANUAL&pump=${newState}&_t=${Date.now()}`);
    }
    targets.push(`http://192.168.4.1/api/command?mode=MANUAL&pump=${newState}&_t=${Date.now()}`);
    targets.forEach((u) => fetch(u, { mode: 'no-cors', cache: 'no-store' }).catch(() => {}));

    try {
      const t0 = performance.now();
      await sendCommand(activeTankId, currentUser.uid, 'MANUAL', newState);
      const elapsed = Math.round(performance.now() - t0);
      setSyncLatency(`Actuated ${elapsed}ms`);
      setStatusText(newState === 'ON' ? 'Manual: Pump RUNNING' : 'Manual: Pump STOPPED');
      addEvent(`Pump → ${newState}`, newState === 'ON' ? '#D4F63D' : '#FF4757');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText(`Error: ${msg}`);
      optimisticPumpRef.current = null;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
    } catch (err) {
      console.error('[Logout] Error:', err);
    }
  };

  // If Firebase is unconfigured
  if (!isConfigured) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#090B10',
          color: '#FFFFFF',
          gap: '16px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '58px',
            height: '58px',
            borderRadius: '18px',
            background: 'rgba(255, 71, 87, 0.12)',
            border: '1.5px solid rgba(255, 71, 87, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FF4757"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Configuration Required</h2>
        <p style={{ fontSize: '13px', color: '#8A92A6', maxWidth: '380px', margin: 0 }}>
          {configError || 'Firebase configuration could not be loaded.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#D4F63D',
            color: '#090B10',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '9999px',
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: '8px',
          }}
          type="button"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Initial authentication loading state
  if (isInitializing) {
    return (
      <div
        id="initial-loader"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#090B10',
          color: '#FFFFFF',
          gap: '20px',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '58px',
            height: '58px',
            borderRadius: '18px',
            background: '#131722',
            border: '1.5px solid rgba(212, 246, 61, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(212, 246, 61, 0.25)',
          }}
        >
          <img src="/favicon.svg" width={38} height={38} alt="Smart Water Tank" />
        </div>
        <div>
          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              margin: '0 0 6px 0',
            }}
          >
            Smart Water Tank{' '}
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#D4F63D',
                verticalAlign: 'middle',
              }}
            ></span>
          </h1>
          <p style={{ fontSize: '13px', color: '#8A92A6', fontWeight: 500, margin: 0 }}>
            Initializing Next.js Cloud Engine & Telemetry...
          </p>
        </div>
        <div
          style={{
            width: '28px',
            height: '28px',
            border: '3px solid rgba(212, 246, 61, 0.15)',
            borderTopColor: '#D4F63D',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        ></div>
      </div>
    );
  }

  // Not logged in -> Show Monex Luxury Login
  if (!currentUser) {
    return <LoginView onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  // Authenticated Dashboard
  const currentLvl = typeof telemetry.levelPercent === 'number' ? telemetry.levelPercent : -1;
  const currentDist = typeof telemetry.distanceCm === 'number' ? telemetry.distanceCm : -1;
  const currentFlow = typeof telemetry.flowRateLpm === 'number' ? telemetry.flowRateLpm : 0;
  const currentTotal = typeof telemetry.totalLitres === 'number' ? telemetry.totalLitres : 0;
  const currentAmps = typeof telemetry.pumpCurrentA === 'number' ? telemetry.pumpCurrentA : 0;
  const currentPumpState = telemetry.pumpState || 'OFF';
  const currentControlMode = telemetry.controlMode || 'AUTO';
  const currentProbe = !!telemetry.waterProbe;
  const currentStatus = telemetry.controllerStatus || 'Standby';

  return (
    <div className="ct" data-motion="ios18-control-center-glass">
      {/* 1. Header with Brand & Cloud Live Badge */}
      <Header onLogout={handleLogout} isOnline={true} />

      {/* 2. Hero Water Level Card (Real Reading, 0ms FCP SSR/ISR & Realtime Animated Cylinder) */}
      <HeroWaterLevelCard levelPercent={currentLvl} distanceCm={currentDist} />

      {/* 3. Controls (Directly below water level box) */}
      <ControlModeCard
        mode={currentControlMode}
        pumpState={currentPumpState}
        levelPercent={currentLvl}
        waterProbe={currentProbe}
        statusText={statusText}
        syncLatency={syncLatency}
        onSetMode={handleSetMode}
        onSetPump={handleSetPump}
      />

      {/* 4. Water Level History Chart (Neon Lime Curve) */}
      <WaterLevelChart history={levelHistory} currentLevel={currentLvl} />

      {/* 5. 2x2 Metrics (Monex Data Chips) */}
      <MetricsGrid
        flowRateLpm={currentFlow}
        totalLitres={currentTotal}
        pumpCurrentA={currentAmps}
        rawAdc={telemetry.rawAdc ?? '--'}
        pumpState={currentPumpState}
        waterProbe={currentProbe}
        controllerStatus={currentStatus}
      />

      {/* 6. Flow Sparkline Chart (Kalo Bars + Line) */}
      <FlowSparklineChart history={flowHistory} currentFlow={currentFlow} />

      {/* 7. Current Gauge + Stats (Kalo Circular Progress Ring) */}
      <CurrentGaugeCard current={currentAmps} peak={peakCurrent} average={avgCurrent} />

      {/* 8. Activity Timeline */}
      <ActivityTimeline events={events} />

      {/* 9. Footer Specs List (Monex Breakdown) */}
      <FooterSpecs
        tankId={activeTankId}
        userEmail={currentUser.email || '--'}
        userRole={userRole}
        lastTelemetry={telemetry.lastUpdatedTime || '--'}
      />
    </div>
  );
}
