const express = require("express");

const FarmLocation = require("../models/FarmLocation");
const {
  getCurrentWeather,
  getCachedCurrentWeather,
  clearWeatherCache,
} = require("../services/weatherService");

const router = express.Router();

const describeLocation = async () => {
  const saved = await FarmLocation.findOne({ key: "default" }).lean();
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

// Location used for weather lookups and stored on new sensor readings.
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
    await FarmLocation.findOneAndUpdate(
      { key: "default" },
      update,
      { upsert: true, runValidators: true }
    );
    clearWeatherCache();
    return res.json(await describeLocation());
  } catch (error) {
    return res.status(500).json({ error: "Failed to save location" });
  }
});

// Revert to WeatherAPI's IP-based lookup.
router.delete("/location", async (req, res) => {
  try {
    await FarmLocation.deleteOne({ key: "default" });
    clearWeatherCache();
    return res.json(await describeLocation());
  } catch (error) {
    return res.status(500).json({ error: "Failed to reset location" });
  }
});

module.exports = router;
