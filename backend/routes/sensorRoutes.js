const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const SensorData = require(
  "../models/sensordata"
);
const { crops } = require("../config/crops");
const CustomCrop = require("../models/CustomCrop");

const {
  createSensorReadingFromHardware,
} = require("../services/weatherService");

// Sensor ingestion (for ESP32 or another trusted device)
router.post("/", async (req, res) => {

  const apiKey = req.get("x-device-api-key");

  if (!process.env.DEVICE_API_KEY || apiKey !== process.env.DEVICE_API_KEY) {
    return res.status(401).json({ error: "Unauthorized device" });
  }

  const isInvalidNumber = (value) => (
    typeof value !== "number" || !Number.isFinite(value)
  );

  if (isInvalidNumber(req.body.soilMoisture)) {
    return res.status(400).json({
      error: "soilMoisture must be a number",
    });
  }

  if (
    req.body.waterTankLevel !== undefined &&
    isInvalidNumber(req.body.waterTankLevel)
  ) {
    return res.status(400).json({
      error: "waterTankLevel must be a number",
    });
  }

  try {
    const sensorData = await createSensorReadingFromHardware({
      location: req.body.location,
      soilMoisture: req.body.soilMoisture,
      waterTankLevel: req.body.waterTankLevel,
      cropKey: req.body.cropKey,
    });

    return res.status(201).json(sensorData);
  } catch (error) {
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

// Latest Data

router.get("/", async (req, res) => {

  try {

    const latestData =
      await SensorData.findOne()
        .sort({ createdAt: -1 });

    res.json(latestData);

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
      await SensorData.find()
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
