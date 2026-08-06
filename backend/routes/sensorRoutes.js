const express = require("express");

const router = express.Router();

const SensorData = require(
  "../models/sensordata"
);

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
    });

    return res.status(201).json(sensorData);
  } catch (error) {
    return res.status(500).json({ error: "Failed to store sensor data" });
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
