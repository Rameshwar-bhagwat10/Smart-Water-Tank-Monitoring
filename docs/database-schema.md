# Database Contract Specification
## Smart Water Tank Monitoring System — Multi-Tenant Firebase Architecture

---

## 1. Overview & Multi-Tenant Architecture

The system utilizes Firebase Realtime Database as a low-latency, bidirectional state synchronization layer. Data is strictly separated into user account identity bindings and isolated storage tank nodes:

```
smart-water-tank/
  users/
    {uid}/
      email: string
      role: "admin" | "operator"
      assignedTankId: string | null
      createdAt: number
  tanks/
    {tankId}/
      name: string
      assignedTo: string (uid)
      live/
        levelPercent: number
        distanceCm: number
        flowRateLpm: number
        totalLitres: number
        pumpCurrentA: number
        pumpState: "ON" | "OFF"
        controlMode: "AUTO" | "MANUAL"
        sensorStatus: "OK" | "DEGRADED" | "ERROR"
        wifiConnected: boolean
        updatedAt: number
      commands/
        requestedMode: "AUTO" | "MANUAL"
        requestedPumpState: "ON" | "OFF"
        commandId: string
        requestedAt: number
        requestedBy: string
      history/
        {logId}/
          timestamp: number
          levelPercent: number
          flowRateLpm: number
          totalLitres: number
          pumpState: "ON" | "OFF"
      alerts/
        {alertId}/
          alertId: string
          createdAt: number
          severity: "INFO" | "WARNING" | "CRITICAL"
          type: string
          message: string
          acknowledged: boolean
```

---

## 2. Sensor Data Alignment & Hardware Pipeline

### Physical Sensors to Database Mapping
The embedded edge controller (ESP8266 / ESP32) reads physical transducers and streams data directly to `/tanks/{tankId}/live`:

| Sensor Model | Physical Measurement | Target Database Field | Range & Unit | Update Rate |
| :--- | :--- | :--- | :--- | :--- |
| **HC-SR04** | Ultrasonic Echo Time $\rightarrow$ Water Level | `distanceCm`, `levelPercent` | $0.0 - 100.0\text{ }\%$ | $1\text{ s} - 2\text{ s}$ |
| **YF-S201** | Hall-effect Pulse $\rightarrow$ Flow Rate | `flowRateLpm`, `totalLitres` | $0.0 - 60.0\text{ L/min}$ | Continuous / $1\text{ s}$ |
| **ACS712** | Hall-effect Current $\rightarrow$ Motor Amps | `pumpCurrentA` | $0.0 - 20.0\text{ A}$ | $1\text{ s}$ |
| **Relay Feedback** | Actuation confirmation | `pumpState` | `"ON"` \| `"OFF"` | On transition |
| **Firmware Logic** | Controller state | `controlMode`, `sensorStatus` | Enum | On change |

### How Sensor Data is Isolated Per User
1. **Device Identification**: Each physical hardware tank unit is configured with its designated `tankId` (e.g. `tank-01`, `tank-02`).
2. **Firmware Publishing**: Firmware on Unit 1 pushes telemetry strictly to `/tanks/tank-01/live`.
3. **User Binding**: When an operator is registered from the Admin Console, their database record `/users/{uid}` is assigned that exact `assignedTankId: "tank-01"`.
4. **Dashboard Isolation**:
   - When **Operator 1** logs in, the dashboard reads `/users/{uid}` &rarr; loads `assignedTankId: "tank-01"`.
   - The dashboard establishes listeners **exclusively** to `/tanks/tank-01/live`, `/tanks/tank-01/history`, and `/tanks/tank-01/alerts`.
   - Operator 1 **never sees or receives** sensor data from `tank-02` or any other unit.
   - Database security rules ([database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json)) reject any read or write attempt by Operator 1 to any tank other than `tank-01`.
5. **Admin Supervisory View**:
   - The Master Admin has `role: "admin"` with no tank assignment constraint.
   - The Admin can observe all tank telemetry across the entire fleet (`/tanks`) simultaneously.

---

## 3. Live Telemetry Node (`/tanks/{tankId}/live`)

Authoritative real-time snapshot of the storage unit and edge controller.

```json
{
  "levelPercent": 78.5,
  "distanceCm": 21.5,
  "flowRateLpm": 14.2,
  "totalLitres": 350.0,
  "pumpCurrentA": 2.85,
  "pumpState": "OFF",
  "controlMode": "AUTO",
  "sensorStatus": "OK",
  "wifiConnected": true,
  "updatedAt": 1792424601000
}
```

---

## 4. Command Node (`/tanks/{tankId}/commands`)

Facilitates asynchronous, validated command dispatch from authorized web operators to the edge controller.

```json
{
  "requestedMode": "MANUAL",
  "requestedPumpState": "ON",
  "commandId": "cmd_1792424650000_abc12",
  "requestedAt": 1792424650000,
  "requestedBy": "usr_operator_uid"
}
```

---

## 5. Security Rules Verification

The active rules in [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json) enforce:
- **`users`**: Authenticated users can read directory; users can initialize their own profile; admin can create/manage all users.
- **`tanks`**: Master Admin can read all tanks; Operators can **only read** their assigned tank (`assignedTankId === $tankId`).
- **`commands`**: Validated mode, pump state, command ID length, and ownership check. Operators can only command their assigned tank.
