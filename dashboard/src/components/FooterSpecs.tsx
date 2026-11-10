'use client';

import React from 'react';

interface FooterSpecsProps {
  tankId?: string;
  userEmail?: string;
  userRole?: string;
  lastTelemetry?: string;
}

export default function FooterSpecs({
  tankId = 'tank-01',
  userEmail = '--',
  userRole = 'operator',
  lastTelemetry = '--',
}: FooterSpecsProps) {
  return (
    <div className="fl" data-motion-item>
      <div className="fl-r">
        <span>Channel</span>
        <b>☁️ Cloud RTDB</b>
      </div>
      <div className="fl-r">
        <span>Tank ID</span>
        <b>{tankId}</b>
      </div>
      <div className="fl-r">
        <span>User</span>
        <b id="userEmail">{userEmail || '--'}</b>
      </div>
      <div className="fl-r">
        <span>Role</span>
        <b>{userRole}</b>
      </div>
      <div className="fl-r">
        <span>Last Telemetry</span>
        <b id="vu">{lastTelemetry}</b>
      </div>
    </div>
  );
}
