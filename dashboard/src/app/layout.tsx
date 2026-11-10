import '../style.css';
import type { Metadata, Viewport } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Smart Water Tank Monitoring System — Cloud Dashboard',
  description:
    'Real-time IoT cloud monitoring, autonomous pump safety controller, and instant telemetry dashboard built with Next.js and Firebase RTDB.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#090B10',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" type="image/png" href="/favicon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: '#090B10', margin: 0, padding: 0 }}>
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
