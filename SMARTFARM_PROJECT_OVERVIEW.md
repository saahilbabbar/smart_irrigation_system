# SmartFarm – Project Overview

**IoT-Based Smart Irrigation Monitoring and Management System**

Software: Saahil Babbar · Hardware/firmware: Vraj Patel
Document state: written from a source-code audit of the working tree on 2026-11-16. This includes uncommitted changes to `backend/models/sensordata.js`, `backend/routes/sensorRoutes.js`, `backend/server.js`, `backend/services/weatherService.js` and `frontend/src/App.jsx`.

> Status legend used throughout:
> ✅ **Implemented**: present in code and wired up
> 🟡 **Partial**: present but incomplete, inconsistent or not verified end-to-end
> ⏳ **Planned**: not in code yet
> 🔧 **Needs hardware**: blocked on components that are not yet available

---

## 1. Introduction

SmartFarm is a smart-agriculture system. An ESP32 reads soil-moisture and air temperature/humidity sensors in the field and sends the readings over Wi-Fi to a Node.js/Express backend. The backend validates each reading, adds current weather from WeatherAPI, works out a crop-aware irrigation recommendation and stores the result in MongoDB. A React dashboard shows the live reading, the sensor health, the weather context, the recommendation and recent trends.

## 2. Problem statement

Farmers often irrigate on a fixed schedule or by feel. This wastes water when the soil is already moist or rain is coming, and it under-waters crops in hot, dry spells. Field conditions are not visible from a distance, and generic advice ignores what each crop needs.

## 3. Objectives

1. Measure soil moisture, air temperature and humidity in real time with low-cost sensors.
2. Store every measurement so it can be reviewed and analysed later.
3. Show live and historical conditions on one dashboard.
4. Give explainable irrigation recommendations that take the crop and the weather into account.
5. Later, automate a pump safely using the same decision logic (🔧).

## 4. Technology stack (verified from `package.json` files)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite 8, JavaScript | Single component file `frontend/src/App.jsx` |
| | Axios, Recharts 3, Framer Motion 12, react-icons | Used |
| | react-router-dom 7 | **Installed but unused** |
| | Styling | Inline style objects in `App.jsx` plus `index.css`. `App.css` is not imported. |
| Backend | Node.js (CommonJS), Express 5, Mongoose 9 | `backend/server.js` |
| | dotenv, cors, axios | Used |
| | bcryptjs, jsonwebtoken | Used by the auth routes only |
| | socket.io | **Installed but unused** |
| Database | MongoDB (any URI given in `MONGO_URI`) | Collections: `sensordatas`, `customcrops`, `users` |
| External API | WeatherAPI.com `current.json` | Current conditions only, with no forecast |
| Hardware | ESP32, capacitive/resistive soil-moisture probe (GPIO 34, 12-bit ADC), DHT22 (GPIO 23) | The firmware is **not in this repository** and is maintained separately by Vraj |

Environment variables (`backend/.env`, git-ignored): `MONGO_URI`, `JWT_SECRET`, `PORT` (currently ignored, see §13), `WEATHER_API_KEY`, `DEVICE_API_KEY`. Frontend: `VITE_API_BASE_URL` (optional, default `http://127.0.0.1:3001/api/sensors`).

## 5. System architecture

```
┌──────────────┐   HTTP POST /api/sensors   ┌───────────────────────────┐
│  ESP32       │  x-device-api-key header   │ Express backend :3001     │
│  soil + DHT22│ ─────────────────────────▶ │  validate → enrich →      │
└──────────────┘     (same Wi-Fi LAN)       │  recommend → save         │
                                            └──────┬─────────────▲──────┘
                       WeatherAPI current.json     │ Mongoose    │ cached 5 min
                       ◀───────────────────────────┼─────────────┘
                                                   ▼
                                            ┌──────────────┐
                                            │  MongoDB     │
                                            └──────┬───────┘
                                                   │ GET /api/sensors (every 5 s)
                                                   │ GET /api/sensors/history (once)
                                                   ▼
                                            ┌──────────────┐
                                            │ React (Vite) │  recomputes the recommendation
                                            │ dashboard    │  for the crop selected in the UI
                                            └──────────────┘
```

## 6. Hardware architecture

| Component | Connection | Output | Status |
|---|---|---|---|
| ESP32 | Wi-Fi STA, HTTP client | JSON POST | ✅ (firmware held separately) |
| Soil-moisture sensor | GPIO 34, analog, 12-bit | raw 0–4095 → % using dry = 4000, wet = 1200 | ✅ |
| DHT22 | GPIO 23 | °C, %RH | ✅ |
| Relay + pump | — | — | 🔧 |
| Rain, flow, pH, NPK, soil-temperature sensors | — | — | 🔧 (no water-tank sensor is planned) |

Soil classification is done **on the ESP32**: below 30 % = DRY, 30 % to below 60 % = MOIST, 60 % and above = WET. The backend accepts the `soilCondition` it receives and does not recalculate it.

The networking requirement is that the ESP32 posts to the laptop's **LAN IPv4** (for example `http://192.168.x.y:3001/api/sensors`), not to `localhost`. The backend listens on `0.0.0.0:3001`, so devices on the LAN can reach it (an uncommitted change). Both devices must be on the same network, and the macOS firewall must allow Node.

## 7. Software architecture

### 7.1 Backend (`backend/`)

| File | Role | Status |
|---|---|---|
| `server.js` | Loads env, connects to Mongo, applies `cors()` + `express.json()`, mounts `/api/auth` and `/api/sensors`, listens on `0.0.0.0:3001` | ✅ |
| `config/db.js` | `mongoose.connect(MONGO_URI)`. Exits the process on failure | ✅ |
| `config/crops.js` | Built-in crop catalog (sugarcane, wheat, rice, potato, onion) plus `getCropByKey()`, which also looks up custom crops. Unknown key → sugarcane | ✅ |
| `routes/sensorRoutes.js` | Ingestion, latest, history, crop list and custom crop routes. Validation is done inline here | ✅ |
| `services/weatherService.js` | WeatherAPI client with a 5-minute in-memory cache and a 4-second timeout, the backend recommendation function and the hardware ingestion function | ✅ |
| `services/weatherService.js → fetchAndStoreWeatherData` | **Legacy code that invents soil moisture from the weather.** Exported but never called | ⚠ dead code that fabricates readings |
| `controllers/sensorController.js` | **Generates random sensor values** and saves them. Not routed | ⚠ dead code that fabricates readings |
| `controllers/authController.js`, `routes/authRoutes.js` | Register/login with bcrypt hashing and a JWT that lasts 7 days | 🟡 the token is never checked anywhere |
| `middleware/authMiddleware.js` | **Empty file** | ⏳ |
| `models/*` | Described in §8 | ✅ |

### 7.2 Frontend (`frontend/src/App.jsx`, single component of about 1,000 lines)

| Area | How it works | Status |
|---|---|---|
| Polling | On mount: `GET /history`, `GET /` and `GET /crops`. Then `GET /` every 5 s. A new reading is appended to the chart history if its `_id` is new (up to 20 points) | ✅ |
| Connection banner | "Backend offline" / "Connecting" / "Sensor data stale" (the newest reading is more than 15 s old) / "Live sensor data", plus the time of the last reading | ✅ |
| Empty and offline states | A clear card when there are no readings or the backend can't be reached | ✅ |
| Metric cards | Soil moisture, soil condition, temperature and humidity show "Unavailable" when null. | ✅ |
| Pump notice | "Physical pump automation: PENDING HARDWARE … software recommendation only" | ✅ |
| Crop selection | Drop-down with the built-in and saved custom crops, plus a form to create a custom crop (validated on the client and the server, saved to Mongo) | 🟡 the selection is **not saved and not sent to the backend** |
| Irrigation decision | Recomputed **in the browser** from the latest reading and the crop selected in the UI (`irrigationDecision` useMemo) | 🟡 duplicates the backend logic, see §11 |
| Environment panel | Location, weather condition, rainfall, wind, sensor online/offline flags, last-updated time | 🟡 uses invented defaults when weather is missing (§13) |
| "AI Recommendation" box | Shows the browser decision, falling back to the stored `recommendation` and then to a fixed text | 🟡 it is rule-based, not AI, and the fixed fallback text is made up |
| Charts | Moisture (area), temperature (line), humidity (bar) | ✅ |
| System Health | Excellent if moisture is over 60, Moderate if over 35, otherwise Critical | 🟡 ignores the crop. Shows "Critical" when the sensor is offline |
| Sidebar navigation | Scrolls to sections on the same page. There is no routing | ✅ |

## 8. Database architecture

### `SensorData` (`backend/models/sensordata.js`, collection `sensordatas`)

| Field | Type | Source | Notes |
|---|---|---|---|
| `location` | String \| null | the place name WeatherAPI returns for the saved laptop coordinates, or for the IP lookup when none are saved | |
| `soilMoisture` | Number \| null | **ESP32** | null when `soilSensorOk` is false |
| `soilRaw` | Number \| null | **ESP32** | ADC value |
| `soilCondition` | `DRY`/`MOIST`/`WET`/null | **ESP32** | |
| `soilSensorOk` | Boolean | **ESP32** | |
| `temperature` | Number \| null | **ESP32 DHT22 only** | the weather value is deliberately overwritten (see note) |
| `humidity` | Number \| null | **ESP32 DHT22 only** | same |
| `dhtSensorOk` | Boolean | **ESP32** | |
| `cropKey`, `cropName` | String | device `cropKey`, otherwise sugarcane | the ESP32 doesn't send a crop, so this is **always sugarcane** in practice |
| `pumpStatus` | `ON`/`OFF` | **calculated by the backend** | ⚠ this is a *recommendation*, not the real pump state |
| `rainfall`, `cloud`, `windSpeed`, `weatherCondition` | Number/String \| null | WeatherAPI (cached) | null when weather has never loaded |
| `recommendation` | String | backend rules | uses the sugarcane thresholds (see above) |
| `createdAt` | Date | server time | no index |

Note: the ingestion service spreads the weather object into the document and then sets `temperature`/`humidity` from the DHT22. The DHT values therefore always win, which is correct. As a side effect, **WeatherAPI's own temperature and humidity are thrown away and never stored.**

### `CustomCrop` (`customcrops`)
`key` (unique, `custom-<ObjectId>`), `name`, `minMoisture`, `maxMoisture` (0–100), `waterRequirement` (> 0), `waterRequirementUnit`, timestamps.

### `User` (`users`)
`name`, `email` (unique), `password` (bcrypt hash), `createdAt`.

## 9. API documentation

Base URL: `http://<host>:3001`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | Health text "Smart Irrigation API Running" |
| POST | `/api/sensors` | `x-device-api-key` must equal `DEVICE_API_KEY` | Ingest one reading |
| GET | `/api/sensors` | — | Latest reading, or `null` |
| GET | `/api/sensors/history` | — | The latest 20 readings, oldest first |
| GET | `/api/sensors/crops` | — | Built-in plus custom crops |
| POST | `/api/sensors/crops/custom` | — ⚠ | Create a custom crop |
| GET | `/api/settings/location` | — | The current weather location `{source: "browser"\|"ip", lat, lon, name}` |
| PUT | `/api/settings/location` | — ⚠ | Save `{lat, lon}` (from the dashboard's "Use my laptop's location" button) |
| DELETE | `/api/settings/location` | — ⚠ | Go back to the IP lookup |
| POST | `/api/auth/register` | — | Create a user (the response includes the password hash ⚠) |
| POST | `/api/auth/login` | — | Returns a JWT (not used anywhere yet) |

### `POST /api/sensors` contract

```http
Content-Type: application/json
x-device-api-key: <DEVICE_API_KEY>
```
```json
{
  "soilRaw": 2200, "soilMoisture": 45, "soilCondition": "MOIST", "soilSensorOk": true,
  "temperature": 28.5, "humidity": 65.0, "dhtSensorOk": true
}
```
*(Illustrative values only.)* Optional fields: `location` (string), `cropKey`. Any other fields are ignored.

Validation rules (`sensorRoutes.js:17-95`):
- `soilSensorOk` and `dhtSensorOk` **must** be booleans → otherwise 400.
- If `soilSensorOk` is true, `soilMoisture` must be a number from 0 to 100, `soilRaw` a finite number and `soilCondition` one of DRY/MOIST/WET.
- If `dhtSensorOk` is true, `temperature` must be finite and `humidity` a number from 0 to 100.
- If a sensor flag is false, its values may be null or absent, and they are **stored as null** whatever the device sends.
- Responses: `201` with the saved document, `400 {error}`, `401 {error:"Unauthorized device"}`, `500 {error:"Failed to store sensor data"}`.
- An outage at WeatherAPI does **not** block ingestion: the last cached weather is used, or the weather fields are left null.

## 10. Sensor data flow

1. The ESP32 reads the ADC on GPIO 34, converts it to % with the dry/wet calibration and classifies the soil. It reads the DHT22 on GPIO 23 and sets the `*SensorOk` flags.
2. The ESP32 POSTs JSON with the device key to the laptop's LAN IP on port 3001.
3. The backend checks the key and validates the payload. The values of a failed sensor are set to null.
4. It fetches weather from the cache (refreshed at most every 5 minutes, with a 4-second timeout).
5. It resolves the crop (`cropKey` → built-in → custom → sugarcane), works out `pumpStatus` and `recommendation`, and saves the document.
6. The dashboard polls `GET /api/sensors` every 5 s, shows the values, marks the data stale after 15 s and recomputes the decision for the crop selected in the UI.

## 11. Irrigation recommendation logic (as implemented)

The same rules exist **in two places**, and they differ slightly.

**Backend** (`weatherService.js` `buildRecommendation`, stored in Mongo; uses the device crop, which is in practice sugarcane):
1. Soil moisture is null → "Soil sensor unavailable. Irrigation recommendation paused."
2. Current rainfall ≥ 1 mm → "Rain detected. Irrigation temporarily suspended."
3. Moisture below the crop minimum → "Irrigation required."
4. Moisture within [min, max] → "adequate"
5. Moisture above the max and temperature over 35 °C → "High temperature detected…" *(this branch is badly placed: it is only reached when the soil is already too wet)*
6. Otherwise → "above target range. No irrigation required."

`pumpStatus = ON` when the soil sensor is OK, moisture is below the minimum, and rainfall is under 1 mm (or unknown).

**Frontend** (`App.jsx` `irrigationDecision`; uses the crop selected in the UI): steps 1–4 and 6 as above, with no temperature branch. Each step returns a status label (`SOIL SENSOR OFFLINE`, `SUSPENDED`, `IRRIGATION REQUIRED`, `MOISTURE ADEQUATE`, `NO IRRIGATION`).

The result is that if the user picks "Wheat", the dashboard shows the wheat decision, while the stored `recommendation`/`pumpStatus` in MongoDB is still worked out for sugarcane.

The weather input is **current precipitation only** (`precip_mm` from `current.json`). There is no forecast and no use of history, humidity or wind in the decision.

## 12. Current implementation status

| Feature | Status |
|---|---|
| ESP32 reads soil moisture and DHT22 | ✅ (per the hardware team; firmware not in the repo) |
| Ingestion API with device-key auth and per-sensor validation | ✅ (uncommitted) |
| DHT22 values stored as the temperature/humidity, separate from WeatherAPI | ✅ (uncommitted) |
| Ingestion still works during a WeatherAPI outage (cache + timeout) | ✅ (uncommitted) |
| Sensor-failure handling (null values + online/offline flags) in the DB and UI | ✅ |
| Last-updated time and stale-data banner | ✅ |
| Live dashboard polling every 5 s | ✅ |
| History charts | 🟡 only the latest 20 points, no date range |
| Crop catalog + custom crops in MongoDB | ✅ |
| Crop-aware recommendation | 🟡 split between the frontend and backend, and the selected crop is not saved |
| WeatherAPI integration | 🟡 current conditions only; weather temperature/humidity discarded; location comes from the laptop's browser location (`PUT /api/settings/location`) or the IP lookup (`auto:ip`) |
| User registration/login | 🟡 works in isolation; no middleware, no frontend, no route protection |
| Pump control | 🔧 not implemented (correct for now); the `pumpStatus` field name is misleading |
| Additional sensors, analytics, crop management, prediction | ⏳ |
| Automated tests | ⏳ none exist |
| End-to-end ESP32 → dashboard run with real hardware | 🟡 `Pending_Evidence_Checklist.txt` says this evidence is still outstanding |

Verified during this audit: every backend file passes `node --check`; `npm run lint` is clean; `npm run build` succeeds (with a warning that the bundle is larger than 500 kB). Not verified at runtime: ingestion against a live MongoDB and a real ESP32.

## 13. Known limitations and defects

**Data integrity (most important: the project rule is "never show made-up data")**
1. The frontend shows invented values when data is missing: location falls back to `"Mumbai, India"` (the backend default is Ratnagiri), weather condition to `"Clear Sky"`, rainfall to `0 mm` and wind to `0 kph`. The "AI Recommendation" box falls back to "Soil moisture is stable. Irrigation system operating normally."
3. System Health shows "Critical" when the soil sensor is offline, and it ignores the crop's thresholds.
4. There are two dead code paths that make up sensor values: `sensorController.js` (random numbers) and `fetchAndStoreWeatherData` (soil moisture estimated from the weather). Neither is reachable today, but both are hazards.
5. The stored `pumpStatus` is a recommendation saved under a field name that implies the actual pump state.

**Logic and consistency**
6. The recommendation logic is duplicated between the frontend and backend and has already drifted (the temperature branch).
7. The crop selected in the UI is not saved; it resets to sugarcane on reload, and the backend never learns about it.
8. The weather input is current precipitation only, with no forecast, so the system can't "delay because rain is expected".
9. The crop catalog is duplicated in `App.jsx` and `config/crops.js`.

**Backend/infrastructure**
10. `PORT` is hard-coded to 3001, and the `.env` `PORT` is ignored. `dotenv.config()` is called twice.
11. The history endpoint is fixed at 20 records with no date filters, and `createdAt` has no index.
12. ~~The weather location is hard-coded to Ratnagiri.~~ Fixed: it now uses the laptop's browser location, with the IP lookup as a fallback. The browser location only works at `http://localhost:5173`, because browsers block it on plain-HTTP LAN addresses.
13. Security: CORS is open to all origins; `POST /crops/custom` has no authentication; `register` returns the password hash and doesn't validate its input; the device key is compared with `!==` rather than a constant-time comparison; no rate limiting.
14. There are no automated tests.
15. Unused dependencies: `socket.io`, `react-router-dom`. Unused files: `App.css`, `assets/hero.png`, `react.svg`, `vite.svg`.

**Repository hygiene**
16. The important fixes listed above are **uncommitted**.
17. The `SmartFarm_Backend_Frontend/`, `SmartFarm_Code_Handoff/` and `*.zip` folders hold **older copies** of the code (for example, without the weather cache and without the `0.0.0.0` bind). It is easy to edit or submit the wrong copy.
18. `SMARTFARM_INTEGRATION_AUDIT.md` describes the **pre-fix** behaviour (it says "temperature/humidity not accepted" and "tank defaults to 75"), which is no longer true.

## 14. Future development roadmap (summary)

See `SMARTFARM_FUTURE_ROADMAP.md` for the details of each item.

1. **Phase 1, finish integration:** commit the fixes, remove fabricated fallbacks, rename/clarify `pumpStatus`, run and document a real end-to-end test.
2. **Phase 2, explainable irrigation logic:** one backend decision engine, a saved active crop, a rain forecast, a structured "why" for each decision.
3. **Phase 3, analytics on existing data:** date-range history, CSV export, daily aggregates.
4. **Phase 4, extensible sensor model:** add pH/NPK/rain/flow without a rewrite (🔧).
5. **Phase 5, pump automation:** relay control with safety cutoffs (🔧).
6. **Phase 6, crop management:** growth stages, fertilizer and pest logs.
7. **Phase 7, intelligence:** anomaly detection first; forecasting only once enough labelled data has been collected.

## 15. Suggested implementation priorities

1. Commit the current working-tree fixes and archive or delete the stale copies of the code.
2. Remove every fabricated fallback in the UI (§13 items 1–3) and delete the two dead code paths that fabricate data.
3. Run a real end-to-end session with Vraj, record the evidence and add a small automated test suite for the ingestion validation.
4. Move the irrigation decision into a single backend module, save the active crop and return reasons with each decision.
5. Add a rain forecast to the decision.
6. Only then move on to analytics, new sensors and the pump.
