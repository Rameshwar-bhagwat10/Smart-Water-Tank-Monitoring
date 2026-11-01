import '../style.css';
import { Outfit, Inter, JetBrains_Mono } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import React from 'react';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="en" className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" type="image/png" href="/favicon.png" />
      </head>
      <body style={{ background: '#090B10', margin: 0, padding: 0 }}>
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
