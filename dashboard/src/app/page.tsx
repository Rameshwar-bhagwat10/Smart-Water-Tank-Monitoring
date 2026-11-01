import DashboardClient from '../components/DashboardClient';
import type { TelemetryData } from '../types/tank';

// Enable Incremental Static Regeneration (ISR) with 1-second background revalidation
export const revalidate = 1;

/**
 * Server-Side Data Fetcher for Next.js ISR (Incremental Static Regeneration)
 * Pre-renders initial telemetry snapshot so water level and metrics are instantly visible on page load (0ms FCP)
 */
async function getInitialTankTelemetry(tankId = 'tank-01'): Promise<TelemetryData | null> {
  const databaseURL = 'https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com';
  const url = `${databaseURL}/tanks/${tankId}/live.json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 1 },
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data: TelemetryData = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Next.js ISR] Telemetry fetch fallback:', msg);
    return null;
  }
}

export default async function Page() {
  const initialTelemetry = await getInitialTankTelemetry('tank-01');

  return (
    <main>
      <DashboardClient initialTelemetry={initialTelemetry} initialTankId="tank-01" />
    </main>
  );
}
