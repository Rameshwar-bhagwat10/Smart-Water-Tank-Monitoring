# Cloud Backend & Notification Services

## Overview
This directory is reserved for cloud backend logic, security rules, serverless functions, and third-party notification integrations for the **Smart Water Tank Monitoring System**.

The system utilizes a secure cloud tier to aggregate device telemetry, manage access credentials, enforce database authorization, and dispatch optional SMS notifications.

## Cloud Technology Stack
- **Database**: Firebase Realtime Database (WebSocket-based bidirectional real-time state synchronization)
- **Identity & Access**: Firebase Authentication (Email/Password or token-based authorization for administrative dashboard users)
- **Hosting**: Firebase Hosting (Static asset hosting for the production dashboard web app)
- **Serverless Backend**: Firebase Cloud Functions (Node.js runtime) for backend automation, event triggers, and secure third-party API communication.

## Cloud Architecture & Responsibilities

### 1. Database Security & Authorization
- Restrictive Firebase Security Rules ensuring authenticated client read access to live telemetry and historical logs.
- Strict write privileges restricting sensor updates exclusively to the authenticated ESP8266 device identity.
- Validation rules ensuring incoming sensor payloads strictly adhere to the contract schema (e.g., `levelPercent` between 0 and 100, valid ISO timestamps).

### 2. Optional SMS Notification Service (Planned for Phase 6)
- **Architecture**: Cloud-based notification dispatch via external SMS provider REST API (e.g., Twilio, Africa's Talking, or AWS SNS).
- **Physical Hardware Exclusion**: **No physical GSM module (e.g., SIM800L/SIM900) or Bluetooth hardware module is used.** The system offloads cellular signaling to the cloud backend to reduce physical device BOM, power consumption, and wiring complexity.
- **Trigger Pipeline**:
  ```
  ESP8266 Alert Event → Firebase Realtime DB /alerts/ → Cloud Function Trigger → External SMS API Gateway → User Handset
  ```
- **Secret Management**: SMS API provider auth tokens, Account SIDs, and service account keys are stored securely in Cloud Secret Manager or environment variables—never committed to source repositories or stored on the ESP8266.

## Current Implementation Status
- **Current Phase**: Phase 1 — Project Setup and Architecture Baseline.
- **Backend Status**: Contracts and architecture defined. **No live Firebase project, cloud functions, or live SMS gateway configurations are active in Phase 1.** Integration will proceed incrementally in Phase 2 (Firebase configuration) and Phase 6 (SMS notification service).
