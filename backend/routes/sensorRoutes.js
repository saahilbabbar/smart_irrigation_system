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

const {
  createSensorReadingFromHardware,
} = require("../services/weatherService");

// Sensor ingestion (for ESP32 or another trusted device)
router.post("/", async (req, res) => {
  const apiKey = req.get("x-device-api-key");

  if (!process.env.DEVICE_API_KEY || apiKey !== process.env.DEVICE_API_KEY) {
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
    if (!isFiniteNumber(body.temperature)) {
      return res.status(400).json({ error: "temperature must be a finite number when dhtSensorOk is true" });
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
router.get("/crops", (req, res) => {
  CustomCrop.find()
    .sort({ createdAt: -1 })
    .then((customCrops) => res.json([...Object.values(crops), ...customCrops]))
    .catch(() => res.status(500).json({ error: "Failed to fetch crop requirements" }));
});

router.post("/crops/custom", async (req, res) => {
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

router.get("/", async (req, res) => {

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

router.get("/history", async (req, res) => {

  try {

    const history =
      await SensorData.find(HARDWARE_READING)
        .sort({ createdAt: -1 })
        .limit(20);

    res.json(history.reverse());

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch history",
    });

  }

});

module.exports = router;
