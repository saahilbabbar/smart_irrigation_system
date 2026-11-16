const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const SensorData = require(
  "../models/sensordata"
);
const { crops, getCropByKey } = require("../config/crops");
const CustomCrop = require("../models/CustomCrop");
const FarmSettings = require("../models/FarmSettings");
const { decideIrrigation } = require("../services/irrigationEngine");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const {
  createSensorReadingFromHardware,
} = require("../services/weatherService");

// Sensor ingestion (for ESP32 or another trusted device)
// Constant-time comparison so response timing does not leak the key.
const isValidDeviceKey = (provided) => {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.post("/", async (req, res) => {
  if (!isValidDeviceKey(req.get("x-device-api-key"))) {
    return res.status(401).json({ error: "Unauthorized device" });
  }

  const body = req.body || {};
  const isFiniteNumber = (value) => (
    typeof value === "number" && Number.isFinite(value)
  );
  const isAbsent = (value) => value === undefined || value === null;

  if (typeof body.soilSensorOk !== "boolean" || typeof body.dhtSensorOk !== "boolean") {
    return res.status(400).json({
      error: "soilSensorOk and dhtSensorOk must be boolean values",
    });
  }

  if (body.soilSensorOk) {
    if (!isFiniteNumber(body.soilMoisture) || body.soilMoisture < 0 || body.soilMoisture > 100) {
      return res.status(400).json({ error: "soilMoisture must be a number between 0 and 100 when soilSensorOk is true" });
    }
    if (!isFiniteNumber(body.soilRaw)) {
      return res.status(400).json({ error: "soilRaw must be a finite number when soilSensorOk is true" });
    }
    if (!["DRY", "MOIST", "WET"].includes(body.soilCondition)) {
      return res.status(400).json({ error: "soilCondition must be DRY, MOIST or WET when soilSensorOk is true" });
    }
  } else if (
    (!isAbsent(body.soilMoisture) && !isFiniteNumber(body.soilMoisture)) ||
    (!isAbsent(body.soilRaw) && !isFiniteNumber(body.soilRaw)) ||
    (!isAbsent(body.soilCondition) && !["DRY", "MOIST", "WET"].includes(body.soilCondition))
  ) {
    return res.status(400).json({ error: "Failed soil sensor readings must be null or valid values" });
  }

  if (body.dhtSensorOk) {
    // DHT22 operating range is -40 to 80 °C.
    if (!isFiniteNumber(body.temperature) || body.temperature < -40 || body.temperature > 80) {
      return res.status(400).json({ error: "temperature must be a number between -40 and 80 when dhtSensorOk is true" });
    }
    if (!isFiniteNumber(body.humidity) || body.humidity < 0 || body.humidity > 100) {
      return res.status(400).json({ error: "humidity must be a number between 0 and 100 when dhtSensorOk is true" });
    }
  } else if (
    (!isAbsent(body.temperature) && !isFiniteNumber(body.temperature)) ||
    (!isAbsent(body.humidity) && !isFiniteNumber(body.humidity))
  ) {
    return res.status(400).json({ error: "Failed DHT sensor readings must be null or finite numbers" });
  }

  try {
    const sensorData = await createSensorReadingFromHardware({
      location: body.location,
      soilRaw: body.soilSensorOk ? body.soilRaw : null,
      soilMoisture: body.soilSensorOk ? body.soilMoisture : null,
      soilCondition: body.soilSensorOk ? body.soilCondition : null,
      soilSensorOk: body.soilSensorOk,
      temperature: body.dhtSensorOk ? body.temperature : null,
      humidity: body.dhtSensorOk ? body.humidity : null,
      dhtSensorOk: body.dhtSensorOk,
      cropKey: body.cropKey,
    });

    return res.status(201).json(sensorData);
  } catch (error) {
    console.error("Sensor ingestion failed:", error.message);
    return res.status(500).json({ error: "Failed to store sensor data" });
  }

});

// Crop requirements used by the dashboard. Values are indicative, not exact.
router.get("/crops", requireAuth, (req, res) => {
  CustomCrop.find()
    .sort({ createdAt: -1 })
    .then((customCrops) => res.json([...Object.values(crops), ...customCrops]))
    .catch(() => res.status(500).json({ error: "Failed to fetch crop requirements" }));
});

router.post("/crops/custom", requireAuth, requireAdmin, async (req, res) => {
  const {
    name,
    minMoisture,
    maxMoisture,
    waterRequirement,
    waterRequirementUnit,
  } = req.body;

  const hasValidNumber = (value) => (
    typeof value === "number" && Number.isFinite(value)
  );

  if (!name?.trim() || !waterRequirementUnit?.trim()) {
    return res.status(400).json({ error: "Crop name and water requirement unit are required" });
  }

  if (
    !hasValidNumber(minMoisture) || minMoisture < 0 || minMoisture > 100 ||
    !hasValidNumber(maxMoisture) || maxMoisture < 0 || maxMoisture > 100 ||
    minMoisture >= maxMoisture ||
    !hasValidNumber(waterRequirement) || waterRequirement <= 0
  ) {
    return res.status(400).json({ error: "Enter a valid moisture range and water requirement" });
  }

  try {
    const customCrop = await CustomCrop.create({
      key: `custom-${new mongoose.Types.ObjectId().toString()}`,
      name: name.trim(),
      minMoisture,
      maxMoisture,
      waterRequirement,
      waterRequirementUnit: waterRequirementUnit.trim(),
    });

    return res.status(201).json(customCrop);
  } catch (error) {
    return res.status(500).json({ error: "Failed to save custom crop" });
  }
});

// Only ESP32 readings carry boolean sensor-status flags; older weather-only/random
// records do not, and must never be shown as measured values.
const HARDWARE_READING = { soilSensorOk: { $type: "bool" } };

// Latest Data

router.get("/", requireAuth, async (req, res) => {

  try {

    const latestData =
      await SensorData.findOne(HARDWARE_READING)
        .sort({ createdAt: -1 })
        .lean();

    if (!latestData) return res.json(null);

    // Re-evaluate the latest reading for the crop selected now, so a crop change
    // shows immediately. The stored `decision` keeps what was decided at the time.
    const settings = await FarmSettings.getSettings();
    const crop = await getCropByKey(settings?.activeCropKey);
    const currentDecision = decideIrrigation({
      soilSensorOk: latestData.soilSensorOk,
      soilMoisture: latestData.soilMoisture,
      temperature: latestData.dhtSensorOk ? latestData.temperature : null,
      rainfall: latestData.rainfall,
      forecastRainMm: latestData.forecastRainMm,
      forecastRainChance: latestData.forecastRainChance,
      forecastWindowHours: latestData.forecastWindowHours,
      crop,
    });

    res.json({ ...latestData, currentDecision });

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch data",
    });

  }

});

// History
// Without ?hours: the latest 20 raw readings (oldest first), as before.
// With ?hours=N (max 720): readings in the last N hours averaged into ~200
// time buckets so long ranges stay chart-sized.
const MAX_HISTORY_HOURS = 720;
const HISTORY_POINTS = 200;

const parseHours = (value) => {
  if (value === undefined) return undefined;
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 && hours <= MAX_HISTORY_HOURS ? hours : null;
};

router.get("/history", requireAuth, async (req, res) => {
  const hours = parseHours(req.query.hours);
  if (hours === null) {
    return res.status(400).json({ error: `hours must be between 0 and ${MAX_HISTORY_HOURS}` });
  }

  try {
    if (hours === undefined) {
      const history = await SensorData.find(HARDWARE_READING)
        .sort({ createdAt: -1 })
        .limit(20);
      return res.json(history.reverse());
    }

    const windowMs = hours * 3600 * 1000;
    const bucketMs = Math.max(5000, Math.ceil(windowMs / HISTORY_POINTS));
    const time = { $toLong: "$createdAt" };

    const history = await SensorData.aggregate([
      { $match: { ...HARDWARE_READING, createdAt: { $gte: new Date(Date.now() - windowMs) } } },
      {
        $group: {
          _id: { $subtract: [time, { $mod: [time, bucketMs] }] },
          soilMoisture: { $avg: "$soilMoisture" },
          temperature: { $avg: "$temperature" },
          humidity: { $avg: "$humidity" },
          readings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          createdAt: { $toDate: "$_id" },
          soilMoisture: { $round: ["$soilMoisture", 1] },
          temperature: { $round: ["$temperature", 1] },
          humidity: { $round: ["$humidity", 1] },
          readings: 1,
        },
      },
    ]);
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// CSV export of raw hardware readings (?hours=N, default 24, max 720).
const CSV_COLUMNS = [
  ["createdAt", (r) => r.createdAt?.toISOString()],
  ["soilRaw", (r) => r.soilRaw],
  ["soilMoisture", (r) => r.soilMoisture],
  ["soilCondition", (r) => r.soilCondition],
  ["soilSensorOk", (r) => r.soilSensorOk],
  ["temperatureC_DHT22", (r) => r.temperature],
  ["humidityPct_DHT22", (r) => r.humidity],
  ["dhtSensorOk", (r) => r.dhtSensorOk],
  ["location", (r) => r.location],
  ["crop", (r) => r.cropName],
  ["temperatureC_WeatherAPI", (r) => r.weatherTemperature],
  ["humidityPct_WeatherAPI", (r) => r.weatherHumidity],
  ["rainfallMm_WeatherAPI", (r) => r.rainfall],
  ["forecastRainMm", (r) => r.forecastRainMm],
  ["forecastRainChancePct", (r) => r.forecastRainChance],
  ["forecastWindowHours", (r) => r.forecastWindowHours],
  ["weatherCondition", (r) => r.weatherCondition],
  ["decision", (r) => r.decision?.action],
  ["recommendation", (r) => r.recommendation],
];

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote when needed; prefix formula-like text so spreadsheets don't execute it.
  const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

router.get("/export.csv", requireAuth, async (req, res) => {
  const hours = parseHours(req.query.hours ?? "24");
  if (hours === null) {
    return res.status(400).json({ error: `hours must be between 0 and ${MAX_HISTORY_HOURS}` });
  }

  try {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="smartfarm-readings-${hours}h-${stamp}.csv"`);
    res.write(`${CSV_COLUMNS.map(([name]) => name).join(",")}\n`);

    const cursor = SensorData.find({ ...HARDWARE_READING, createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .lean()
      .cursor();
    for await (const reading of cursor) {
      res.write(`${CSV_COLUMNS.map(([, get]) => csvCell(get(reading))).join(",")}\n`);
    }
    return res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: "Failed to export readings" });
  }
});

module.exports = router;
