# Cloud & Database Security Specification
## Smart Water Tank Monitoring System — Security Architecture & Access Control

---

## 1. Security Philosophy & Threat Model

The Smart Water Tank Monitoring System incorporates IoT actuators (high-current DC water pumps and mechanical relays) that can cause structural flooding or motor damage if manipulated maliciously. 

The security architecture operates under a **Deny-by-Default Defense-in-Depth** model:
1. **Zero Public Access**: Unauthenticated requests to any database path are rejected at the edge.
2. **Strict Identity Validation**: Clients must authenticate via Firebase Authentication.
3. **Role-Based Authorization (RBAC)**: All user actions are gated by an immutable server-side access record in `/access/{uid}`.
4. **Structural Payload Validation**: Commands must strictly adhere to the defined schema; unexpected fields are blocked.
5. **Decoupled Actuation**: Writing a command record does not turn on the pump. The ESP8266 reviews local safety cutoffs before physical actuation.

---

## 2. Realtime Database Security Rules Breakdown

The active rules file [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json) enforces the following granular protections:

### A. Access Control Path (`/access/{uid}`)
```json
"access": {
  "$uid": {
    ".read": "auth != null && (auth.uid === $uid || root.child('access').child(auth.uid).child('role').val() === 'admin')",
    ".write": false
  }
}
```
- **Read**: Authenticated users can read only their own access record, while administrators can read all user records.
- **Write**: Completely locked (`.write: false`). **No browser client or ordinary user can modify, grant, or elevate permissions.** Roles are provisioned strictly via the Firebase Console or authorized backend services.

### B. Device Telemetry Path (`/devices/{deviceId}/live`)
```json
"live": {
  ".write": false
}
```
- **Read**: Inherited from parent `devices/$deviceId` (`auth != null && enabled === true`).
- **Write**: Ordinary browser writes are denied (`.write: false`). Telemetry is owned exclusively by the hardware edge controller.

### C. Command Submission Path (`/devices/{deviceId}/commands`)
```json
"commands": {
  ".write": "auth != null && root.child('access').child(auth.uid).child('enabled').val() === true && (root.child('access').child(auth.uid).child('role').val() === 'admin' || root.child('access').child(auth.uid).child('role').val() === 'operator') && newData.exists()",
  ".validate": "newData.hasChildren(['requestedMode', 'requestedPumpState', 'commandId', 'requestedAt', 'requestedBy'])",
  "requestedMode": {
    ".validate": "newData.isString() && (newData.val() === 'AUTO' || newData.val() === 'MANUAL')"
  },
  "requestedPumpState": {
    ".validate": "newData.isString() && (newData.val() === 'ON' || newData.val() === 'OFF')"
  },
  "commandId": {
    ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 64"
  },
  "requestedAt": {
    ".validate": "newData.isNumber() && newData.val() >= 0"
  },
  "requestedBy": {
    ".validate": "newData.isString() && newData.val() === auth.uid"
  },
  "$other": {
    ".validate": false
  }
}
```
- **Write Authorization**: Only authenticated users with `enabled === true` AND a role of `admin` or `operator` can write. Viewers are blocked.
- **Anti-Deletion**: `newData.exists()` prevents client deletion of command records.
- **Identity Integrity**: `requestedBy` must match `auth.uid`—spoofing another user's identity is rejected.
- **Zero-Tolerance for Unexpected Fields**: `$other: { ".validate": false }` rejects payloads containing unauthorized keys (e.g. attempting to inject arbitrary override flags).

### D. Historical Logs & Alerts (`/devices/{deviceId}/history` and `/alerts`)
```json
"history": { ".write": false },
"alerts": { ".write": false }
```
- Browser clients cannot alter or erase chronological telemetry history or fabricate trusted hardware alerts.

---

## 3. Secure Device Authentication Strategy (Phase 4 Roadmap)

When physical or simulated ESP8266 microcontrollers connect to Firebase in Phase 4:
1. **No Service Account Keys on Microcontrollers**: Embedded flash memory is vulnerable to physical dumping. Google Cloud service-account private keys or admin database tokens must **never** be placed in microcontroller firmware.
2. **Dedicated Device Authentication**:
   - The ESP8266 will authenticate using Firebase Authentication (e.g., dedicated device service account tokens or device email/password identity).
   - The device will be assigned a specialized role (e.g., `device: true`) granting write privileges only to its assigned `/devices/{deviceId}/live` and `/devices/{deviceId}/history` paths.

---

## 4. Protection of Third-Party SMS Credentials (Phase 6 Roadmap)

- In Phase 6, optional SMS alerts will be dispatched via external telecom REST APIs (e.g., Twilio or Africa's Talking).
- All provider Account SIDs and Auth Tokens will reside strictly in serverless Cloud Functions environment variables or Google Secret Manager.
- Zero SMS credentials or telecom secrets will ever be placed in client dashboard code or microcontroller firmware.
