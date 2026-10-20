/**
 * Smart Water Tank Monitoring System — ESP8266 Device Secrets Template
 * Copy this file to include/secrets.h and fill in your network and device credentials.
 * DO NOT commit the real secrets.h to version control.
 */

#pragma once

// Wi-Fi Network Credentials
#define WIFI_SSID           "YOUR_WIFI_SSID"
#define WIFI_PASSWORD       "YOUR_WIFI_PASSWORD"

// Firebase Realtime Database Endpoint
// Example: "https://smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com"
#define FIREBASE_HOST       "smart-water-tank-monitor-c38c0-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH_KEY   "YOUR_DEVICE_AUTH_TOKEN_OR_SECRET"

// Physical Tank Assignment (Must match the allocated tank ID in database)
// Example: "tank-01", "tank-02"
#define TANK_ID             "tank-01"

// Device Identity
#define DEVICE_UID          "device_esp8266_tank01"
#define FIRMWARE_VERSION    "1.0.0"
