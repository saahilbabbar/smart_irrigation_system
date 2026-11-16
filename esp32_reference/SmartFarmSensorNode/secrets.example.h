// Copy this file to "secrets.h" (same folder) and fill in real values.
// secrets.h is git-ignored. Never commit real Wi-Fi passwords or API keys.
#pragma once

#define WIFI_SSID      "YOUR_WIFI_NAME"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"

// The laptop's LAN IP. On the laptop (macOS) run: ipconfig getifaddr en0
// Must NOT be localhost or 127.0.0.1. On the ESP32 that means the ESP32 itself.
#define BACKEND_URL    "http://192.168.1.19:3001/api/sensors"

// Same value as DEVICE_API_KEY in backend/.env (ask Saahil, shared privately).
#define DEVICE_API_KEY "PASTE_DEVICE_API_KEY_HERE"
