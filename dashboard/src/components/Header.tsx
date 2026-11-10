'use client';

import React from 'react';

interface HeaderProps {
  onLogout?: () => void;
  isOnline?: boolean;
}

export default function Header({ onLogout, isOnline = true }: HeaderProps) {
  return (
    <div className="hd" data-motion-item>
      <div className="hd-brand">
        <div className="hd-icon">
          <img src="/favicon.svg" width={22} height={22} alt="Water Tank" />
        </div>
        <div className="hd-t">Water Tank</div>
      </div>
      <div className="hd-right">
        <div className="hd-b" id="connBadge">
          <span className="dp"></span> {isOnline ? 'Cloud Live' : 'Connecting...'}
        </div>
        {onLogout && (
          <button className="logout-btn" onClick={onLogout} title="Sign out" type="button">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        )}
      </div>
    </div>
  );
}
