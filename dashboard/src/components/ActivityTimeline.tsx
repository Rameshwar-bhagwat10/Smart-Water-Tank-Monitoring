'use client';

import React from 'react';
import { ActivityEvent } from '../types/tank';

interface ActivityTimelineProps {
  events?: ActivityEvent[];
}

export default function ActivityTimeline({ events = [] }: ActivityTimelineProps) {
  return (
    <div className="cd" data-motion-item>
      <div className="ch-hd">
        <span className="ch-t">Activity Log</span>
        <span className="ch-v" id="tl-ct">
          {events.length} events
        </span>
      </div>
      <div className="tl" id="tl">
        {events.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-sec)', padding: '8px 0' }}>
            No events yet
          </div>
        ) : (
          events.map((e, i) => (
            <div className="tl-item" key={i}>
              <div className="tl-dot" style={{ background: e.color }}></div>
              {i < events.length - 1 && <div className="tl-line"></div>}
              <div className="tl-body">
                <div className="tl-msg">{e.msg}</div>
                <div className="tl-time">{e.ts}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
