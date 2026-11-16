const express = require("express");

const FarmSettings = require("../models/FarmSettings");
const CustomCrop = require("../models/CustomCrop");
const { crops, getCropByKey } = require("../config/crops");
const {
  getCurrentWeather,
  getCachedCurrentWeather,
  clearWeatherCache,
} = require("../services/weatherService");

const router = express.Router();

const saveSettings = (update) => FarmSettings.findOneAndUpdate(
  { key: "default" },
  update,
  { upsert: true, runValidators: true }
);

/*
  LOCATION (used for weather lookups and stored on new sensor readings)
*/

const describeLocation = async () => {
  const saved = await FarmSettings.getSettings();
  const weather = await getCachedCurrentWeather();
  let source = "ip";
  if (saved?.place) source = "place";
  else if (saved?.lat != null) source = "browser";
  return {
    source,
    lat: saved?.lat ?? null,
    lon: saved?.lon ?? null,
    place: saved?.place ?? null,
    name: weather?.location ?? null,
  };
};

router.get("/location", async (req, res) => {
  try {
    return res.json(await describeLocation());
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch location" });
  }
});

// Body: { lat, lon } from the browser's geolocation, or { place } typed by the user.
router.put("/location", async (req, res) => {
  const { lat, lon, place } = req.body || {};
  const validCoord = (v, limit) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

  let update;
  if (typeof place === "string" && place.trim()) {
    if (place.trim().length > 100) {
      return res.status(400).json({ error: "Place name is too long" });
    }
    update = { place: place.trim(), lat: null, lon: null };
  } else if (validCoord(lat, 90) && validCoord(lon, 180)) {
    // ~11 m precision is plenty for weather and avoids storing an exact position.
    update = { place: null, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
  } else {
    return res.status(400).json({ error: "Send { lat, lon } or { place }" });
  }

  // Confirm WeatherAPI can resolve it before saving.
  try {
    await getCurrentWeather(update.place ?? `${update.lat},${update.lon}`);
  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(400).json({ error: "WeatherAPI could not find that place. Try a nearby town or city name." });
    }
    return res.status(502).json({ error: "Weather service unavailable; location not saved. Try again." });
  }

  try {
    await saveSettings(update);
    clearWeatherCache();
    return res.json(await describeLocation());
  } catch (error) {
    return res.status(500).json({ error: "Failed to save location" });
  }
});

// Revert to WeatherAPI's IP-based lookup (keeps other settings such as the crop).
router.delete("/location", async (req, res) => {
  try {
    await saveSettings({ lat: null, lon: null, place: null });
    clearWeatherCache();
    return res.json(await describeLocation());
  } catch (error) {
    return res.status(500).json({ error: "Failed to reset location" });
  }
});

/*
  ACTIVE CROP (used for every irrigation decision)
*/

router.get("/crop", async (req, res) => {
  try {
    const settings = await FarmSettings.getSettings();
    return res.json(await getCropByKey(settings?.activeCropKey));
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active crop" });
  }
});

router.put("/crop", async (req, res) => {
  const { cropKey } = req.body || {};
  if (typeof cropKey !== "string" || !cropKey.trim()) {
    return res.status(400).json({ error: "cropKey is required" });
  }

  try {
    const exists = crops[cropKey] || await CustomCrop.exists({ key: cropKey });
    if (!exists) {
      return res.status(400).json({ error: "Unknown crop" });
    }
    await saveSettings({ activeCropKey: cropKey });
    return res.json(await getCropByKey(cropKey));
  } catch (error) {
    return res.status(500).json({ error: "Failed to save active crop" });
  }
});

module.exports = router;
