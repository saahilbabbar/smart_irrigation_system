# ESP32 → SmartFarm backend: handoff for Vraj

The backend and dashboard are ready. The only missing piece is the ESP32 sending its readings over Wi-Fi.
`SmartFarmSensorNode/SmartFarmSensorNode.ino` is a complete reference sketch for this. You can flash it as it is, or copy the `sendReading()` part into your existing firmware and keep your own calibration and sensor code.

## 1. Setup
1. Arduino IDE → Library Manager → install **DHT sensor library** (Adafruit) and **Adafruit Unified Sensor**.
2. Board: **ESP32 Dev Module** (ESP32 board package installed).
3. Copy `secrets.example.h` to `secrets.h` in the same folder and fill in:
   - `WIFI_SSID` / `WIFI_PASSWORD`: the **same Wi-Fi network as the laptop running the backend**. The ESP32 only supports **2.4 GHz** networks.
   - `BACKEND_URL`: `http://<laptop LAN IP>:3001/api/sensors`. Saahil gets the IP with `ipconfig getifaddr en0` (currently `192.168.1.19`). It can change when the router restarts. **Never use `localhost`.**
   - `DEVICE_API_KEY`: Saahil sends it to you privately. Don't commit it; `secrets.h` is git-ignored.
4. Upload the sketch and open the Serial Monitor at **115200 baud**.

## 2. The contract the backend expects
`POST /api/sensors`, sent every 5 s (the dashboard marks data as stale after 15 s).

Headers:
```
Content-Type: application/json
x-device-api-key: <DEVICE_API_KEY>
```
Body when the sensors are working (illustrative values):
```json
{"soilRaw":2200,"soilMoisture":45,"soilCondition":"MOIST","soilSensorOk":true,
 "temperature":28.5,"humidity":65.0,"dhtSensorOk":true}
```
Body when a sensor fails (for example, the DHT22 returns NaN): set its flag to `false` and send `null` for its values. **Never send 0 or a guessed value instead.**
```json
{"soilRaw":2200,"soilMoisture":45,"soilCondition":"MOIST","soilSensorOk":true,
 "temperature":null,"humidity":null,"dhtSensorOk":false}
```
Rules:
- Numbers must be JSON numbers, not strings.
- `soilSensorOk` and `dhtSensorOk` are always required and must be `true`/`false`.
- `soilMoisture` must be 0–100, `soilCondition` must be `DRY`, `MOIST` or `WET`, and `humidity` must be 0–100.

## 3. Reading the Serial Monitor
| Output | Meaning | Fix |
|---|---|---|
| `HTTP 201 {...}` | Saved. It appears on the dashboard within 5 s | — |
| `HTTP 401` | Wrong or missing API key | Re-copy `DEVICE_API_KEY` exactly |
| `HTTP 400 {"error": "..."}` | A field is wrong. The message names it | Fix that field |
| `HTTP -1 (connection refused)` / `-11` | Can't reach the laptop | Check the IP, that both devices are on the same Wi-Fi, that the backend is running, and that the macOS firewall allows `node` |
| `Wi-Fi connection failed` | Wrong SSID or password, or a 5 GHz network | Use 2.4 GHz |

Quick check from a phone or laptop on the same Wi-Fi: open `http://<laptop IP>:3001/`. It should say "Smart Irrigation API Running". If it doesn't load, the ESP32 can't reach the backend either.

## 4. Test checklist (record the results as evidence)
1. Both sensors connected: `HTTP 201`, and the dashboard shows the same moisture, temperature and humidity as the Serial Monitor.
2. Unplug the DHT22: `"dhtSensorOk":false`; the temperature and humidity cards show "Unavailable".
3. Unplug the soil probe: `"soilSensorOk":false`; the soil card shows "Unavailable" and the recommendation pauses.
4. Probe in dry air, then in water: the raw value is close to 4000, then close to 1200. Adjust `SOIL_DRY_RAW`/`SOIL_WET_RAW` if not.
5. Stop the backend for 30 s: the dashboard banner shows "Backend offline" or "Sensor data stale"; the ESP32 logs negative codes and recovers on its own when the backend comes back.

## Notes
- GPIO 34 is an ADC1 pin, which is correct: ADC2 pins stop working while Wi-Fi is on.
- The "sensor fault" check for the soil probe (raw stuck at 0 or 4095) is a simple heuristic. Replace it with your own logic if you have it.
- This sketch has **not been compiled** on the software side, because there is no ESP32 toolchain here. Compile it and report any errors.
