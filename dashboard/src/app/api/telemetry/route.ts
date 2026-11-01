import { NextRequest, NextResponse } from 'next/server';
import type { TelemetryData } from '../../../types/tank';

export const revalidate = 1;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tankId = searchParams.get('tankId') || 'tank-01';
  const databaseURL = 'https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com';

  try {
    const res = await fetch(`${databaseURL}/tanks/${tankId}/live.json`, {
      next: { revalidate: 1 },
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      // Graceful fallback for unauthenticated edge or bench environments
      const fallback: TelemetryData = {
        levelPercent: 0.0,
        distanceCm: 0.0,
        flowRateLpm: 0.0,
        totalLitres: 0.0,
        pumpCurrentA: 0.0,
        pumpState: 'OFF',
        controlMode: 'AUTO',
        controllerStatus: 'IDLE',
        updatedAt: Date.now(),
      };
      return NextResponse.json(fallback, {
        headers: {
          'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=59',
        },
      });
    }

    const data: TelemetryData = await res.json();
    return NextResponse.json(data || {}, {
      headers: {
        'Cache-Control': 'public, s-maxage=1, stale-while-revalidate=59',
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const fallbackErr: TelemetryData = {
      levelPercent: 0.0,
      distanceCm: 0.0,
      flowRateLpm: 0.0,
      totalLitres: 0.0,
      pumpCurrentA: 0.0,
      pumpState: 'OFF',
      controlMode: 'AUTO',
      controllerStatus: 'IDLE',
      sensorStatus: msg,
      updatedAt: Date.now(),
    };
    return NextResponse.json(fallbackErr, { status: 200 });
  }
}
