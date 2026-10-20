# Firebase Project Setup & Configuration Guide
## Smart Water Tank Monitoring System — Phase 2 Firebase Architecture

---

## 1. Overview & Cloud Architecture

Phase 2 establishes the real-time cloud data plane and identity access management layer using **Firebase Realtime Database** and **Firebase Authentication**.

```
[ Web Dashboard Client ] 
    │ HTTPS / WSS (TLS 1.3)
    ├── Authenticates via Firebase Auth (Email & Password)
    ├── Enforces Role Record in /access/{uid} (admin / operator / viewer)
    └── Subscribes to Realtime Database (/devices/tank-01/live)
            ▲
            │ (Realtime Sync & Rules Validation)
            ▼
[ Firebase Realtime Database ]
    ├── /access/{uid}              (Administrator-provisioned roles)
    ├── /devices/tank-01/live      (Read-only to clients; firmware owned)
    ├── /devices/tank-01/commands  (Validated atomic command submissions)
    ├── /devices/tank-01/history   (Append-only chronological snapshots)
    └── /devices/tank-01/alerts    (Critical system alarms & events)
```

---

## 2. Environment Configuration

### Client Environment Variables
The dashboard is built using Vite and accesses client configuration variables prefixed with `VITE_`.

In the dashboard directory, configuration is stored in the local untracked file:
`dashboard/.env.local`

Required variable definitions:
- `VITE_FIREBASE_API_KEY`: Web API Key associated with the Firebase project.
- `VITE_FIREBASE_AUTH_DOMAIN`: Project authentication domain (`{projectId}.firebaseapp.com`).
- `VITE_FIREBASE_DATABASE_URL`: Realtime Database endpoint (`https://{projectId}-default-rtdb.firebaseio.com`).
- `VITE_FIREBASE_PROJECT_ID`: Target Firebase project ID (`smart-water-tank-monitor-c38c0`).
- `VITE_FIREBASE_APP_ID`: Web application registration identifier.

> [!IMPORTANT]
> **Client Config vs. Authorization**: Firebase Web configuration keys are public client identifiers used by browser SDKs to locate Google Cloud resources. They do **not** grant authorization. Security boundaries, data privacy, and write permissions are enforced exclusively by **Firebase Authentication** and **Realtime Database Security Rules**.

A sanitized template is maintained in [dashboard/.env.example](file:///d:/projects/Smart%20Water%20Tank/dashboard/.env.example).

---

## 3. Administrator & User Account Provisioning

Self-registration is deliberately disabled in the dashboard to prevent unauthorized parties from accessing or controlling industrial/residential pumping systems.

### Step-by-Step User Provisioning (Firebase Console)

1. **Enable Email/Password Sign-In**:
   - Open [Firebase Console](https://console.firebase.google.com/).
   - Navigate to **Build** $\rightarrow$ **Authentication** $\rightarrow$ **Sign-in method**.
   - Enable the **Email/Password** provider and save.

2. **Create the First Administrator Account**:
   - Go to the **Users** tab in Firebase Authentication.
   - Click **Add user**.
   - Enter the administrator's email and a strong password.
   - Copy the generated **User UID** (e.g., `WzXy8912KlMnOp...`).

3. **Provision the Role Access Record in Realtime Database**:
   - Navigate to **Build** $\rightarrow$ **Realtime Database** $\rightarrow$ **Data**.
   - Create a child node under `access/`:
     ```json
     {
       "access": {
         "YOUR_ADMIN_UID": {
           "enabled": true,
           "role": "admin"
         }
       }
     }
     ```
   - Available roles:
     - `admin`: Full telemetry read access + command submission authority.
     - `operator`: Full telemetry read access + manual pump command submission authority.
     - `viewer`: Read-only telemetry access; command submission blocked.

---

## 4. Deploying Realtime Database Security Rules

Security rules are maintained in [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json).

### Method A: Direct Deployment via Firebase CLI
When working in an authenticated terminal session:

```powershell
# 1. Log in to your Google Account (browser authentication)
npx firebase-tools login

# 2. Verify project selection
npx firebase-tools projects:list
npx firebase-tools use smart-water-tank-monitor-c38c0

# 3. Deploy the database security rules
npx firebase-tools deploy --only database
```

### Method B: Manual Deployment via Firebase Console
If the terminal session is unauthenticated:
1. Open the **Firebase Console**.
2. Navigate to **Build** $\rightarrow$ **Realtime Database** $\rightarrow$ **Rules** tab.
3. Replace existing rules with the contents of [database.rules.json](file:///d:/projects/Smart%20Water%20Tank/database.rules.json).
4. Click **Publish**.

---

## 5. Local Development & Testing Commands

```powershell
# Enter dashboard
cd dashboard

# 1. Run local development server
npm run dev

# 2. Run unit tests and rules validation
npm test

# 3. Build production bundle
npm run build
```

---

## 6. Troubleshooting Common Issues

| Symptom | Probable Cause | Remediation |
| :--- | :--- | :--- |
| `Missing required environment variable(s)` | `dashboard/.env.local` is missing or keys are blank. | Check `.env.local` syntax and ensure all 5 `VITE_FIREBASE_*` variables exist. |
| `auth/invalid-credential` | Incorrect email or password entered. | Verify credentials in Firebase Console $\rightarrow$ Authentication $\rightarrow$ Users. |
| `User Access Not Enabled` screen appears | The user authenticated successfully, but no matching record exists in `/access/{uid}`. | Add `{ "enabled": true, "role": "admin" }` under `access/{user.uid}` in Realtime Database. |
| `Permission Denied` on command submission | User role is `viewer`, account is disabled, or security rules rejected invalid fields. | Ensure role is `admin` or `operator` and payload contains only the 5 permitted keys. |
| Telemetry shows `--` or "Awaiting Device Telemetry" | The database node `/devices/tank-01/live` has not been written by an edge device. | Normal behavior. Telemetry is populated once firmware or a mock test script streams data. |
