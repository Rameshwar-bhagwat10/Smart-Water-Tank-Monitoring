# Smart Water Tank Mobile — Flutter Application 🌊📱

A high-performance, dark luxury cross-platform mobile application for real-time Smart Water Tank monitoring and autonomous IoT pump control. Built with **Flutter**, **Firebase Realtime Database & Authentication**, and ultra-low latency direct-LAN actuation.

---

## 🌟 Key Features

1. **Exact Monex & Kalo Luxury Dark Aesthetic**:
   - Deep obsidian background (`#090B10`) with top radial ambient lighting.
   - Glassmorphic elevated cards (`#131722`) with subtle borders and neon glows.
   - Signature **Electric Chartreuse / Neon Lime** (`#D4F63D`) and **Cyan** (`#3DF6D9`) accents.
   - Premium Google Fonts (`Outfit`, `Inter`, `JetBrains Mono`).

2. **Ultra-Fast Dual-Channel Actuation (<1ms Response)**:
   - **Optimistic State Engine**: Touching Start/Stop or Automatic/Manual updates the UI and triggers haptic feedback instantly in `<1ms`, locking against rubber-banding for 3500ms.
   - **Direct LAN Fast-Path**: When connected to the same Wi-Fi router or ESP8266 AP (`192.168.4.1` or `deviceIp`), fires non-blocking local HTTP requests (`/api/command`) for 1ms hardware switching!
   - **Cloud Firebase Synchronization**: Simultaneously writes to `/tanks/tank-01/commands` and updates `/tanks/tank-01/live` for fleet-wide real-time sync.

3. **Real-time Live Telemetry & Ultrasonic Processing**:
   - Sub-100ms streaming telemetry updates from Firebase RTDB with high-frequency HTTP backup polling.
   - Ultrasonic blind-zone handling: Clamps distances under 2.0 cm (e.g. hand held close to sensor) to 100% tank level with zero glitching.
   - Full Tank Alarm: Automatically sounds an audible and haptic alert when the tank is $\ge 95\%$ full and the water probe detects water.

4. **Dynamic Canvas Visualizations**:
   - **Tank Cylinder**: Animated 3D-styled liquid level cylinder with graduation tick marks and glowing neon surface bar.
   - **Water Level Trend**: Custom Canvas chart with gradient lime fill, 2.5px curve, and pulsing terminal dot.
   - **2x2 Metrics Grid**: Flow rate, pump current with raw ADC, relay state pill, and controller state.
   - **Flow Sparkline**: Vertical rounded bars with neon cyan sparkline overlay.
   - **Pump Current Ring**: 270° circular arc gauge ring with dynamic color transitions (Green → Amber → Red).
   - **Activity Log**: Event history timeline with status color indicators and timestamps.
   - **Specs Footer**: Technical breakdown of active channels, tank ID, operator, and NodeMCU IP.

---

## 🚀 Getting Started

### Prerequisites
- Flutter SDK 3.24+ / 3.35+
- Dart 3.5+
- Android SDK / Android Studio or physical device connected via USB

### Installation

```bash
cd mobile
flutter pub get
```

### Running the App

```bash
# Run on connected Android device or emulator
flutter run

# Run on Chrome for instant desktop preview
flutter run -d chrome

# Run on Windows desktop
flutter run -d windows
```

### Building Release APK

```bash
flutter build apk --release
```
Output will be generated at `build/app/outputs/flutter-apk/app-release.apk`.

---

## 🔒 Firebase Configuration & Credentials

The application is pre-configured with project credentials:
- **Project ID**: `smart-water-tank-monitor-c38c0`
- **Database URL**: `https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com`
- **Auth Domain**: `smart-water-tank-monitor-c38c0.firebaseapp.com`
- **Default Operator Email**: `operator@gmail.com`
