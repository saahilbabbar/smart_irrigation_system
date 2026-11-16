/*
  SmartFarm sensor node: ESP32 + capacitive soil-moisture sensor + DHT22
  Reads the sensors every SEND_INTERVAL_MS and POSTs JSON to the SmartFarm backend.

  Reference implementation for the hardware team. Keep your own calibration and
  pin logic if it differs. The part the backend depends on is the HTTP contract
  in sendReading().

  Libraries (Arduino IDE > Library Manager):
    - "DHT sensor library" by Adafruit
    - "Adafruit Unified Sensor" by Adafruit
  WiFi.h and HTTPClient.h come with the ESP32 board package.
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include "secrets.h"   // copy secrets.example.h to secrets.h and fill it in

// ---------- Pins and calibration ----------
const int SOIL_PIN = 34;        // ADC1 pin, so it still works while Wi-Fi is on (ADC2 does not)
const int DHT_PIN  = 23;
#define DHT_TYPE DHT22

const int SOIL_DRY_RAW = 4000;  // raw ADC reading in dry air
const int SOIL_WET_RAW = 1200;  // raw ADC reading in water
const int SOIL_SAMPLES = 10;    // readings averaged to smooth ADC noise

const unsigned long SEND_INTERVAL_MS = 5000;  // dashboard marks data stale after 15 s
const uint16_t HTTP_TIMEOUT_MS = 5000;

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSendAt = 0;

// ---------- Wi-Fi ----------
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to Wi-Fi \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected. ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Wi-Fi connection failed; will retry next cycle.");
  }
}

// ---------- Sensors ----------
struct SoilReading {
  bool ok;
  int raw;
  int moisture;          // 0-100 %
  const char* condition; // DRY / MOIST / WET
};

SoilReading readSoil() {
  long sum = 0;
  for (int i = 0; i < SOIL_SAMPLES; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  int raw = sum / SOIL_SAMPLES;

  SoilReading r;
  r.raw = raw;
  // A raw value pinned at 0 or 4095 usually means a disconnected or shorted sensor.
  // Adjust this check if your wiring behaves differently.
  r.ok = raw > 0 && raw < 4095;

  int pct = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  r.moisture = constrain(pct, 0, 100);

  if (r.moisture < 30)      r.condition = "DRY";
  else if (r.moisture < 60) r.condition = "MOIST";
  else                      r.condition = "WET";
  return r;
}

// ---------- HTTP ----------
void sendReading() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping send: Wi-Fi not connected.");
    return;
  }

  SoilReading soil = readSoil();
  float temperature = dht.readTemperature();  // °C
  float humidity    = dht.readHumidity();     // %RH
  bool dhtOk = !isnan(temperature) && !isnan(humidity);

  // Build JSON. Failed sensors send false + null, never 0 or a guessed value.
  char soilPart[160];
  if (soil.ok) {
    snprintf(soilPart, sizeof(soilPart),
      "\"soilRaw\":%d,\"soilMoisture\":%d,\"soilCondition\":\"%s\",\"soilSensorOk\":true",
      soil.raw, soil.moisture, soil.condition);
  } else {
    snprintf(soilPart, sizeof(soilPart),
      "\"soilRaw\":null,\"soilMoisture\":null,\"soilCondition\":null,\"soilSensorOk\":false");
  }

  char dhtPart[120];
  if (dhtOk) {
    snprintf(dhtPart, sizeof(dhtPart),
      "\"temperature\":%.1f,\"humidity\":%.1f,\"dhtSensorOk\":true",
      temperature, humidity);
  } else {
    snprintf(dhtPart, sizeof(dhtPart),
      "\"temperature\":null,\"humidity\":null,\"dhtSensorOk\":false");
  }

  char body[320];
  snprintf(body, sizeof(body), "{%s,%s}", soilPart, dhtPart);

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-api-key", DEVICE_API_KEY);

  Serial.print("POST ");
  Serial.println(body);
  int status = http.POST(body);

  // 201 = saved | 400 = bad field (see response) | 401 = wrong API key
  // negative = cannot reach backend (wrong IP, different Wi-Fi, firewall, server down)
  Serial.printf("HTTP %d", status);
  if (status > 0) {
    Serial.print("  ");
    Serial.println(http.getString());
  } else {
    Serial.printf("  (%s)\n", http.errorToString(status).c_str());
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  analogReadResolution(12);                     // 0-4095
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);  // full ~0-3.3 V range
  dht.begin();
  connectWiFi();
}

void loop() {
  connectWiFi();  // reconnects automatically if the router drops

  if (millis() - lastSendAt >= SEND_INTERVAL_MS) {
    lastSendAt = millis();
    sendReading();
  }
  delay(50);
}
