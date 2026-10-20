# Hybrid Cloud & Local Edge Connectivity Architecture

**Document Reference**: `docs/architecture/hybrid-connectivity.md`  
**Audit Finding Addressed**: `NET-001` (High / P1) — Mixed-Content Browser Blocking & Local API Standardization  
**Components**: ESP8266 Local Web Server (`LocalDashboardServer`), Web Dashboard (`dashboard/src/main.js`), Firebase Cloud Gateway  
**Status**: ARCHITECTURE VERIFIED & API STANDARDIZED  

---

## 1. Executive Summary & NET-001 Analysis

The Smart Water Tank Monitoring System features a **dual-stack hybrid operational model**:
1. **Cloud Gateway Mode**: The NodeMCU station connects to local Wi-Fi and synchronizes with Firebase Realtime Database over TLS (`https://<project>-default-rtdb.firebaseio.com`). Operators access the dashboard from anywhere via cellular or broadband.
2. **Direct Local Link Mode**: In disaster scenarios, rural deployments, or broadband outages, the NodeMCU simultaneously broadcasts an emergency local 802.11 b/g/n Access Point (`SmartTank-<tankId>`) at IP `192.168.4.1`. The controller hosts an embedded web dashboard and a standardized REST API, enabling operators and technicians to monitor water levels and command pumps locally without internet or external routers.

### The Browser Mixed-Content Challenge (`NET-001`)
When the Web Dashboard is hosted on an HTTPS origin (e.g., Firebase Hosting at `https://smart-water-tank-monitor-c38c0.web.app` or GitHub Pages):
- Modern browser security engines (Chromium, WebKit, Gecko) enforce strict **Mixed Content** and **Private Network Access (PNA)** rules.
- JavaScript running on an HTTPS page is **strictly prohibited** from executing `fetch('http://192.168.4.1/api/live')` because the target is unencrypted HTTP inside a RFC1918 private network.
- Setting CORS headers (`Access-Control-Allow-Origin: *`) on the ESP8266 does **not** bypass Mixed Content blocking; browsers block the request before network dispatch.

### Remediation & Supported Operational Paths:
1. **Native Embedded Controller Dashboard**: The NodeMCU serves a self-contained, high-performance HTML/CSS/JS dashboard directly at `http://192.168.4.1/`. When an operator connects their phone to the `SmartTank-<tankId>` hotspot and opens `http://192.168.4.1`, both origin and destination are HTTP, operating 100% free of mixed-content constraints.
2. **Dashboard HTTPS Guidance**: When the hosted dashboard detects `window.location.protocol === 'https:'`, it displays clear guidance directing the user to the embedded local interface (`http://192.168.4.1`) or switches seamlessly to Cloud Mode.

---

## 2. Standardized Local Edge REST API Specification

All local endpoints are standardized under the `/api/` prefix (with legacy route redirects preserved for backward compatibility):

### 2.1 Endpoint Summary Table

| Route | Method | Authentication Required | Parameters / Body | Response Schema | Description |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **`/api/live`** | `GET` | None | None | `{ "tankId": string, "levelPercent": float, "distanceCm": float, "flowRateLpm": float, "totalLitres": float, "pumpCurrentA": float, "pumpState": "ON"\|"OFF", "controlMode": "AUTO"\|"MANUAL", "sensorStatus": string, "isLevelValid": bool, "wifiConnected": bool, "updatedAt": number }` | Real-time telemetry feed polled every 1.5s by local dashboards. |
| **`/api/login`** | `POST` | Valid PIN | `pin` or `pass` (x-www-form-urlencoded) | `{ "success": bool, "token": string, "expiresIn": 900, "tankId": string, "role": "operator" }` | Authenticates operator/technician and issues 15-minute session token. Rate-limited (5 attempts $\rightarrow$ 30s lockout). |
| **`/api/command`** | `POST` | Token or PIN | `token` or `pin`, `mode` ("AUTO"\|"MANUAL"), `pumpState` ("ON"\|"OFF") | `{ "success": bool, "status": "APPLIED"\|"REJECTED", "reason": string, "pumpState": string, "controlMode": string }` | Dispatches mode change or manual pump trigger. Interlocked with local safety engine. |
| **`/api/scan-wifi`** | `GET` | None | None | `[ { "ssid": string, "rssi": int }, ... ]` | Scans available 2.4 GHz BSSIDs for setup wizard dropdown. |
| **`/api/wifi-setup`** | `POST` | Token or PIN | `pin`, `ssid` (1..32 chars), `pass` ($\le 64$ chars), `tankId` | `{ "success": bool, "message": string }` | Flashes network credentials & tank assignment to EEPROM and restarts MCU. |
| **`/setup`** | `GET` | None | None | `text/html` | Embedded Technician Provisioning & Wi-Fi Configuration Wizard. |
| **`/`** | `GET` | None (Overlay auth) | None | `text/html` | Embedded Autonomous Local Web Dashboard. |

---

## 3. Command & State Distinction Model

To prevent false claims of actuation, the architecture strictly distinguishes between four distinct states:

```
+---------------------------------------------------------------------------------------+
| 1. Requested Command State (User Intent)                                             |
|    - Stored in Firebase at /tanks/{tankId}/commands or POSTed to /api/command         |
|    - Values: mode="MANUAL", pumpState="ON", requestedAt=1700000000, requestedBy=UID  |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 2. Controller Verified Acknowledged State                                             |
|    - Dispatched by ESP8266 to /tanks/{tankId}/commandAcks/{commandId}                 |
|    - Values: status="APPLIED" (Relay actuated) or "REJECTED" (Safety lock tripped)    |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 3. Physical Relay Drive State                                                         |
|    - Measured logic level on GPIO12 output latch                                      |
|    - Values: LOW (Energized) vs HIGH (De-energized)                                   |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
| 4. Verified Physical Load Operation                                                   |
|    - Measured ACS712 current (I > 0.5A) AND flow rate (Q > 0.5 L/min)                 |
|    - Never claimed as "Running" unless electrical/hydraulic feedback is confirmed!    |
+---------------------------------------------------------------------------------------+
```

---

## 4. Manual Browser Verification Test Plan

### Test Scenario 1: Direct Local Connection on SoftAP
1. Power up ESP8266 NodeMCU.
2. On smartphone or laptop Wi-Fi settings, scan and connect to SSID **`SmartTank-tank-01`** using WPA2 passphrase **`WaterTank2026!`**.
3. Open mobile browser and navigate to `http://192.168.4.1/`.
4. **Expected Result**: Embedded Local Dashboard loads immediately. Telemetry displays current water level and sensor readings.
5. Enter operator PIN (`admin123`) to unlock supervisory controls.
6. Switch to `MANUAL` and click `⚡ Request ON`.
7. **Expected Result**: Status updates to `APPLIED`, Yellow LED lights, relay clicks, and telemetry reflects active state.

### Test Scenario 2: Technician Setup Wizard
1. In browser, navigate to `http://192.168.4.1/setup`.
2. Click `🔄` button next to Wi-Fi SSID dropdown.
3. **Expected Result**: Controller executes local 2.4 GHz scan and populates dropdown with nearby SSIDs and signal strengths (dBm).
4. Enter target Wi-Fi SSID, password, select tank (`tank-01`), enter Security PIN (`admin123`), and submit.
5. **Expected Result**: Controller commits configuration to EEPROM, sends JSON success reply, and reboots. Green LED blinks and connects to building router.

### Test Scenario 3: Mixed Content Rejection Handling on HTTPS
1. Open the hosted cloud dashboard at `https://smart-water-tank-monitor-c38c0.web.app`.
2. Click `Direct Local Link (Offline Mode)`.
3. Enter credentials and attempt connection to `http://192.168.4.1`.
4. **Expected Result**: Dashboard catches browser mixed-content block and displays:  
   *`🛡️ Browser Security Note (Mixed Content): Since this dashboard is served over HTTPS, your browser may block HTTP requests to http://192.168.4.1. Please open the Local Embedded Controller Dashboard directly in a new tab or switch to Cloud Mode.`*
