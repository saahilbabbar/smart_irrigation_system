# SmartFarm – Future Development Roadmap

Companion to `SMARTFARM_PROJECT_OVERVIEW.md`. The items are ordered by value and by what they depend on. File references point to the current code.

**Guiding principle:** a reliable, honest, end-to-end irrigation loop with recommendations that explain themselves is worth more than a long list of features. Every new item should keep these rules: *no invented readings, sensor data kept separate from weather data, and recommendations kept separate from the actual pump state*.

Complexity: **S** = under half a day · **M** = 1–3 days · **L** = a week or more
Priority: **P0** = do now · **P1** = next · **P2** = after that · **P3** = when the data or hardware allows

---

## A. Immediate priorities (Phase 1: finish the hardware-software integration)

### A1. Commit the fixes and clean up the repository: P0 · S
- **What:** commit the five modified files. Move `SmartFarm_Backend_Frontend/`, `SmartFarm_Code_Handoff/` and the `*.zip` files out of the repo (or into a git-ignored `archive/`). Mark `SMARTFARM_INTEGRATION_AUDIT.md` as historical.
- **Why:** the working DHT22/weather separation exists only in uncommitted changes, and the older copies can easily be edited or submitted by mistake.
- **Frontend / backend / DB:** none.
- **Hardware:** none.
- **Testing:** `git status` is clean; the build and lint still pass.

### A2. Remove fabricated values from the UI: P0 · S
- **What:** in `App.jsx`, replace the fallbacks `"Mumbai, India"`, `"Clear Sky"`, `|| 0` for rainfall and wind, and the fixed "Soil moisture is stable…" text with "Unavailable". Make System Health return "Unknown" when the sensor is offline and use the selected crop's min/max. Rename "AI Recommendation" to "Recommendation" (it is rule-based).
- **Why:** the project rule is that the dashboard never shows data nobody measured.
- **Frontend:** `App.jsx` only. **Backend/DB:** none. **Hardware:** none.
- **Testing:** with WeatherAPI unavailable, the dashboard shows "Unavailable" everywhere and never 0 or a default.

### A3. Delete the dead code paths that fabricate data: P0 · S
- **What:** delete `backend/controllers/sensorController.js` (random values) and `fetchAndStoreWeatherData` in `weatherService.js` (soil moisture estimated from the weather).
- **Why:** neither is reachable, but either one could be wired in by accident and fill MongoDB with invented readings.
- **Testing:** `grep` confirms no references remain; the backend starts.

### A4. Separate the "recommended" pump state from the "actual" one: P0 · S
- **What:** add `recommendedPumpStatus` to `SensorData`, keep writing `pumpStatus` for compatibility (marked deprecated in a comment), and reserve `actualPumpStatus` (null until the hardware exists).
- **Why:** a field called `pumpStatus` that holds a recommendation will be misread once a real pump exists.
- **Backend:** `weatherService.js`, `models/sensordata.js`. **Frontend:** show "Recommended: ON" with the pump notice. **DB:** additive fields only, no migration needed.
- **Testing:** a new reading contains both fields; old documents still display.

### A5. Real end-to-end test with Vraj, and an ingestion test suite: P0 · M
- **What:** (1) run a session that is written up: the ESP32 posts to `http://<laptop LAN IP>:3001/api/sensors`; record the serial log, the HTTP status, the stored document and a dashboard screenshot, including unplugging each sensor to check its failure handling. (2) Add `node:test` + `supertest` (dev-only) tests for the ingestion validation rules: missing key → 401, missing flags → 400, `soilSensorOk:false` → values stored as null, an outage at WeatherAPI → still 201.
- **Why:** this is the main deliverable, and `Pending_Evidence_Checklist.txt` still lists it as outstanding.
- **Backend:** export `app` from `server.js` separately from `listen` so tests can import it. **DB:** a separate test database URI.
- **Hardware:** an ESP32 with both sensors.
- **Testing:** that is the item itself.

### A6. Small backend corrections: P1 · S
- Respect `process.env.PORT || 3001`. Call `dotenv.config()` only once.
- Add an index on `createdAt` to `SensorData`.
- Check that the DHT22 temperature is within its −40 to 80 °C range.
- Compare the device key with `crypto.timingSafeEqual`.
- Stop `register` returning the password hash; validate its input.

---

## B. Short-term improvements (Phase 2: explainable irrigation logic, Phase 6a: basic analytics)

### B1. One irrigation decision engine on the backend: P1 · M · ✅ done (2026-11-16)
- **What:** move the logic into `backend/services/irrigationEngine.js`, a pure function `decide({reading, crop, weather, forecast}) → {status, action, reasons[], inputs}`. The `action` is one of `IRRIGATE`, `DELAY`, `SUFFICIENT`, `PAUSED`. Store it on each reading. The frontend stops recomputing and only *displays* the stored decision and its reasons.
- **Why:** the frontend and backend copies have already drifted (the temperature branch), and the stored recommendation doesn't match what the user sees. A single pure function is also easy to unit-test and explain.
- **Frontend:** remove the `irrigationDecision` useMemo and render `reading.decision.reasons` as a "Why?" list.
- **Backend:** the new module; `weatherService.js` calls it. **DB:** a `decision` sub-document on `SensorData`.
- **Testing:** a table of test cases (moisture × crop × rain → expected action and reasons).

### B2. Saved active crop: P1 · S · ✅ done (2026-11-16)
- **What:** a single `FarmSettings` document (`activeCropKey`, later location) with `GET/PUT /api/settings`. Ingestion uses it when the device doesn't send a `cropKey`. The drop-down writes to it.
- **Why:** today the crop resets to sugarcane on reload, and stored recommendations always use sugarcane.
- **Frontend:** load and save the selection. **Backend:** the route + `getCropByKey(settings.activeCropKey)`. **DB:** a new `farmsettings` collection.
- **Testing:** select wheat, reload, check the new reading has `cropKey: "wheat"`.

### B3. Rain-forecast-aware delay: P1 · M
- **What:** use WeatherAPI `forecast.json?days=1` (the same API key) and take the expected precipitation and rain probability for the next 6–12 h. Rule: when the moisture is below the minimum but not critical (for example, not more than 10 points under) and rain of at least X mm is expected with a probability of at least Y %, the action is `DELAY`, with the reason "Rain of ~N mm expected within H h".
- **Why:** this is the single biggest water saving the project can show, and it is fully explainable.
- **Backend:** extend the weather cache (forecasts can be cached for 30–60 min). **DB:** store `forecastRainMm`, `forecastRainChance` on each reading. **Frontend:** a forecast line in the environment panel.
- **Testing:** unit tests with a mocked forecast; a manual check against the WeatherAPI response.

### B4. Store weather temperature/humidity separately: P2 · S
- **What:** keep WeatherAPI's values as `weatherTemperature`/`weatherHumidity` instead of throwing them away, and show them labelled "Weather (WeatherAPI)" next to "Sensor (DHT22)".
- **Why:** it is useful context, and comparing the two helps catch a faulty DHT22. It must never replace the sensor values.
- **Testing:** with the DHT22 offline, `temperature` is null while `weatherTemperature` is filled in.

### B5. History with date ranges and CSV export: P1 · M
- **What:** `GET /api/sensors/history?from=&to=&limit=` (with a capped limit) and `GET /api/sensors/export.csv?from=&to=`. The dashboard gets range presets (1 h / 24 h / 7 d) and an "Export CSV" button.
- **Why:** this is needed for the project report's results section and for any later analysis.
- **DB:** uses the `createdAt` index from A6.
- **Testing:** the range boundaries, an empty range, and a CSV column check.

### B6. Split `App.jsx` into components: P2 · M
- **What:** split it into `components/` (MetricCards, CropPanel, EnvironmentPanel, Charts, ConnectionBanner) and `api.js`. Only do this alongside B1/B5, which change this code anyway.
- **Why:** a 1,000-line file makes every later phase slower. **Testing:** the build, lint and a visual check.

---

## C. Medium-term improvements (Phase 3: more sensors, Phase 4: pump, Phase 5: crop management)

### C1. Extensible sensor model: P2 · M · 🔧 for real data
- **What:** add an optional `extraSensors` map to the ingestion payload, plus a backend registry `{key, unit, min, max, label}` (for example `soilPh`, `npkN/P/K`, `soilTemp`, `rain`, `flowLpm`). Each sensor carries its own `ok` flag. The UI only renders sensors present in the latest reading **with ok = true**. Unknown keys are rejected.
- **Why:** sensors can be added without a schema rewrite, and the UI never shows sensors that aren't connected.
- **Firmware:** Vraj adds the fields as the hardware arrives (no change needed until then).
- **Testing:** validation for each sensor; a card appears only when the sensor is present.

### C3. Pump control: P2 · L · 🔧 (do not start until the relay and pump are tested on the bench)
- **What:**
  - A `PumpEvent` collection (`start`, `stop`, `reason`, `mode: manual|auto`, `durationSec`, `litres?`).
  - `POST /api/pump/command` (authenticated users only).
  - The ESP32 *pulls* commands (`GET /api/device/commands`) or gets them in the response to its sensor POST.
  - The ESP32 reports the pump's real state in each reading (`actualPumpStatus`).
- **Safety (required):**
  - A maximum run time per cycle.
  - A minimum off-time between cycles.
  - A daily runtime cap.
  - Automatic stop when the soil sensor fails.
  - The **firmware** turns the pump off if it can't reach the backend for N seconds.
- **Why:** this is the last step of the automation loop, but it is the riskiest part.
- **Testing:** test each safety rule on the bench with the pump disconnected first, then a supervised wet test.

### C4. Authentication for control and settings routes: P2 · M
- **What:** implement `authMiddleware.js` (JWT), protect `PUT /settings`, `POST /crops/custom` and every pump route, and add a login page. Keep the device key for ingestion. Restrict CORS to the dashboard's origin.
- **Why:** this is required before the pump can be controlled remotely. Until then it is low risk on a LAN.

### C5. Crop management: P3 · M
- **What:** growth stages per crop (`stages: [{name, days, minMoisture, maxMoisture}]`) plus a planting date in `FarmSettings`, so the decision engine uses the current stage's thresholds. Later, `FarmLog` entries (fertilizer, pest, irrigation done by hand) and reminders.
- **Why:** thresholds for each growth stage are agronomically meaningful; the logs feed the analytics.

---

## D. Long-term features (Phase 6: analytics, Phase 7: intelligence)

### D1. Analytics dashboards: P3 · M
Daily min/mean/max aggregates (a Mongo aggregation pipeline), irrigation history from `PumpEvent`, water used (🔧 flow sensor), and a "moisture response after irrigation" chart (moisture from −1 h to +6 h around each pump event).

### D2. Sensor anomaly detection (rule-based): P3 · S–M
Flag a stuck value (identical readings for N minutes), physically impossible jumps (for example, moisture changing by more than 30 points in one minute), DHT22 against WeatherAPI differing by more than about 10 °C for a long period, and a missing heartbeat (no reading for more than 1 minute). This is **useful without ML** and should come before any model.

### D3. Moisture forecasting / ML: P3 · L (only once the data justifies it)
- **Data needed:** at least several weeks of continuous readings at 1–5-minute intervals from one plot, with irrigation events logged (from C3 or by hand) and weather/forecast stored for each reading.
- **Features:**
  - lagged moisture
  - slope over the last 1, 3 and 6 h
  - air temperature and humidity
  - forecast rain
  - hour of day
  - time since last irrigation
  - crop stage
- **Target:** soil moisture 6–24 h ahead.
- **Models to try, in order:**
  1. A baseline that extends the current slope (persistence).
  2. Linear regression.
  3. Gradient boosting.
  4. A recurrent or other deep model, only if the simpler ones clearly fail.
- **Evaluation:** MAE/RMSE on a **time-based** holdout, compared against the baseline. Then a simulated comparison of water used and minutes below threshold under the rule engine versus the forecast-driven engine.
- **Rule:** if the model doesn't clearly beat the baseline, don't ship it. The rule engine from B1 stays as the fallback either way.

---

## Recommended order at a glance

| # | Item | Priority | Size | Hardware? |
|---|---|---|---|---|
| 1 | A1 Commit + repo cleanup | P0 | S | – |
| 2 | A2 Remove fabricated UI values | P0 | S | – |
| 3 | A3 Delete fabricating dead code | P0 | S | – |
| 4 | A4 Recommended vs actual pump field | P0 | S | – |
| 5 | A5 Real E2E test + ingestion tests | P0 | M | ESP32 |
| 6 | A6 Backend corrections | P1 | S | – |
| 7 | B1 Single decision engine with reasons | P1 | M | – |
| 8 | B2 Saved active crop | P1 | S | – |
| 9 | B3 Forecast-aware delay | P1 | M | – |
| 10 | B5 History ranges + CSV | P1 | M | – |
| 11 | B4 Weather temperature/humidity stored separately | P2 | S | – |
| 12 | B6 Split App.jsx | P2 | M | – |
| 13 | C1 Extensible sensor model | P2 | M | 🔧 |
| 14 | C4 Auth for control routes | P2 | M | – |
| 15 | C3 Pump control | P2 | L | 🔧 |
| 16 | C5, D1, D2 | P3 | M | partly 🔧 |
| 17 | D3 ML forecasting | P3 | L | data |

## The finished SmartFarm, in five modules

1. **Farm Monitoring:** live readings from every *connected* sensor, sensor health, heartbeat and anomaly flags.
2. **Smart Irrigation:** a single explainable engine (crop stage + moisture + forecast) driving recommendations, and later a safety-limited pump whose real state is reported separately.
3. **Crop Management:** the active crop and growth stage, plus fertilizer and pest logs with reminders.
4. **Analytics:** date-range trends, irrigation and water-use history, how moisture responds after watering, CSV export.
5. **Intelligence:** rule-based anomaly detection; moisture forecasting only after it beats a simple baseline on real data.
