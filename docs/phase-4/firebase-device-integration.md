# Phase 4 Firebase Device Integration & Telemetry Specification
## Smart Water Tank Monitoring System — Cloud Telemetry, Device Scoping & Security Rules

**Document Reference**: `docs/phase-4/firebase-device-integration.md`  
**Backend**: Firebase Realtime Database (REST API via HTTPS / TLS 1.2)  
**Security Model**: Device Registry Authorization & Least-Privilege Scoping  
**Status**: IMPLEMENTED AND VERIFIED  

---

## 1. Executive Summary

The Firebase integration connects edge ESP8266 devices to the cloud while maintaining strict operational isolation:
1. **Device Identity & Least-Privilege**: Each physical controller is registered in `/deviceRegistry/{deviceUid}` with an explicit `assignedTankId` and `enabled: true` flag. The device has write permissions **only** to its assigned tank's `/live`, `/commandAcks`, `/alerts`, and `/history` paths.
2. **Administrative Isolation**: The physical device cannot read or modify user accounts, change its own tank assignment, or write arbitrary database nodes.
3. **Resilient Bounded Synchronization**: Telemetry is pushed via HTTP PUT requests at a bounded 2000 ms cadence with a strict 3000 ms timeout. Cloud communication failures never block local safety decisions.

---

## 2. Live Telemetry Data Schema (`/tanks/{tankId}/live`)

Every 2000 ms, `FirebaseClient::publishTelemetry()` serializes and transmits the following structured JSON document:

```json
{
  "levelPercent": "72.4",
  "distanceCm": "42.6",
  "flowRateLpm": "14.2",
  "totalLitres": "184.50",
  "pumpCurrentA": "2.14",
  "pumpState": "ON",
  "controlMode": "AUTO",
  "controllerStatus": "AUTO_FILLING",
  "sensorStatus": "OK",
  "faultCode": "NONE",
  "wifiConnected": true,
  "updatedAt": 1718900125000
}
```

### 2.1 Field Specification & Types

| Field Name | Type | Unit / Enum Values | Purpose |
| :--- | :---: | :--- | :--- |
| **`levelPercent`** | Number/Str | $0.0 - 100.0\,\%$ | Calibrated water level percentage. |
| **`distanceCm`** | Number/Str | $\text{cm}$ | Measured acoustic distance from sensor to water surface. |
| **`flowRateLpm`** | Number/Str | $\text{L/min}$ | Current instantaneous turbine water flow rate. |
| **`totalLitres`** | Number/Str | $\text{Litres}$ | Cumulative water volume pumped since reset. |
| **`pumpCurrentA`** | Number/Str | $\text{Amperes}$ | Filtered RMS AC/DC motor current. |
| **`pumpState`** | String | `"ON"` \| `"OFF"` | Commanded state of the physical relay driver. |
| **`controlMode`** | String | `"AUTO"` \| `"MANUAL"` | Active operating mode. |
| **`controllerStatus`**| String | `"INITIALIZING"`, `"IDLE"`, `"AUTO_FILLING"`, `"MANUAL_FILLING"`, `"STOPPING"`, `"FAULT"`, `"SENSOR_ERROR"` | Exact 7-state state machine condition. |
| **`sensorStatus`** | String | `"OK"`, `"DEGRADED"`, `"ERROR"` | Transducer health summary. |
| **`faultCode`** | String | `"NONE"`, `"HIGH_LEVEL_CUTOFF"`, `"MAX_RUNTIME_EXCEEDED"`, `"DRY_RUN_DETECTED"`, `"SENSOR_FAULT"` | Machine-readable active safety lockout code. |
| **`wifiConnected`**| Boolean | `true` \| `false` | Station Wi-Fi connection indicator. |
| **`updatedAt`** | Number | Epoch Milliseconds | UTC timestamp of the measurement packet. |

---

## 3. Database Security Rules Enforcement

The Firebase Realtime Database security rules (`database.rules.json`) guarantee multi-tenant scoping:

### 3.1 Device Authorization Rule on Live Telemetry
```json
"live": {
  ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (root.child('deviceRegistry').child(auth.uid).child('enabled').val() === true && root.child('deviceRegistry').child(auth.uid).child('assignedTankId').val() === $tankId))",
  ".validate": "newData.hasChildren(['levelPercent', 'pumpState', 'updatedAt'])"
}
```
- A device authenticated with UID `dev_abc` assigned to `tank-01` **cannot** write to `/tanks/tank-02/live`.
- If an admin disables a controller (`enabled: false`), all further write attempts are rejected with HTTP 401/403.
- Normal web dashboard operators have **zero write access** to live telemetry, preventing spoofed sensor readings.

### 3.2 Command Consumption Isolation
```json
"commands": {
  ".read": "auth != null && (... || (root.child('deviceRegistry').child(auth.uid).child('enabled').val() === true && root.child('deviceRegistry').child(auth.uid).child('assignedTankId').val() === $tankId))",
  ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || root.child('users').child(auth.uid).child('assignedTankId').val() === $tankId) && newData.exists() ..."
}
```
- Devices have **read-only** access to the `commands` node. Devices consume commands but cannot write or modify them.
- Devices communicate execution outcomes exclusively by writing to `commandAcks`.

---

## 4. Network Resilience & Fault Handling

1. **Non-Blocking Execution**: All cloud requests run on non-blocking intervals. If `WiFiClientSecure` times out (3000 ms), `main.cpp` continues executing local sensor loops and relay protections without interruption.
2. **Bounded Reconnection**: If Wi-Fi link drops, `maintainWifi()` attempts reconnection every 5000 ms without tight polling loops or watchdog starving.
3. **NTP Time Synchronization**: Once Wi-Fi connects, `configTime(0, 0, "pool.ntp.org", "time.google.com")` synchronizes UTC time for command TTL validation.
4. **Alert Publishing**: Latched safety lockouts trigger a single, bounded event upload to `/tanks/{tankId}/alerts/` to prevent database write flooding.
