const axios = require("axios");

const SensorData = require("../models/sensordata");
const FarmSettings = require("../models/FarmSettings");
const { getCropByKey } = require("../config/crops");
const { decideIrrigation } = require("./irrigationEngine");

const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const FORECAST_WINDOW_HOURS = 6;
const HOUR_S = 3600;
let cachedWeather = null;
let cachedWeatherAt = 0;
let lastWeatherAttemptAt = 0;

// Saved dashboard coordinates if set, otherwise WeatherAPI's IP lookup of the
// backend laptop's public IP (city-level accuracy).
const getWeatherQuery = async () => {
  const saved = await FarmSettings.getSettings();
  if (saved?.place) return saved.place;
  if (saved?.lat != null && saved?.lon != null) return `${saved.lat},${saved.lon}`;
  return "auto:ip";
};

// Total forecast rain and highest hourly chance of rain for hourly slots that
// overlap (now, now + windowHours]. Pure, so it is unit-tested.
const summariseForecast = (forecastDays, nowEpoch, windowHours) => {
  const end = nowEpoch + windowHours * HOUR_S;
  const slots = (forecastDays || [])
    .flatMap((day) => day.hour || [])
    .filter((h) => h.time_epoch + HOUR_S > nowEpoch && h.time_epoch < end);

  if (slots.length === 0) {
    return { forecastRainMm: null, forecastRainChance: null, forecastWindowHours: windowHours };
  }
  return {
    forecastRainMm: Math.round(slots.reduce((sum, h) => sum + (h.precip_mm || 0), 0) * 10) / 10,
    forecastRainChance: Math.max(...slots.map((h) => h.chance_of_rain || 0)),
    forecastWindowHours: windowHours,
  };
};

// One forecast.json call returns current conditions and the hourly forecast.
const getCurrentWeather = async (query) => {
  const weatherResponse = await axios.get(
    "https://api.weatherapi.com/v1/forecast.json",
    {
      params: {
        key: process.env.WEATHER_API_KEY,
        q: query ?? await getWeatherQuery(),
        days: 2, // covers a 6 h window that crosses midnight
        aqi: "no",
        alerts: "no",
      },
      timeout: 4000,
    }
  );

  const { current: weather, location: place, forecast } = weatherResponse.data;

  return {
    ...summariseForecast(forecast?.forecastday, Math.floor(Date.now() / 1000), FORECAST_WINDOW_HOURS),
    location: [place?.name, place?.region].filter(Boolean).join(", ") || null,
    temperature: weather.temp_c,
    humidity: weather.humidity,
    rainfall: weather.precip_mm,
    cloud: weather.cloud,
    windSpeed: weather.wind_kph,
    weatherCondition: weather.condition.text,
  };
};

const getCachedCurrentWeather = async () => {
  if (cachedWeather && Date.now() - cachedWeatherAt < WEATHER_CACHE_TTL_MS) {
    return cachedWeather;
  }
  if (Date.now() - lastWeatherAttemptAt < WEATHER_CACHE_TTL_MS) return cachedWeather;

  lastWeatherAttemptAt = Date.now();
  try {
    cachedWeather = await getCurrentWeather();
    cachedWeatherAt = Date.now();
    return cachedWeather;
  } catch (error) {
    console.warn("Weather enrichment unavailable:", error.message);
    return cachedWeather;
  }
};

const clearWeatherCache = () => {
  cachedWeather = null;
  cachedWeatherAt = 0;
  lastWeatherAttemptAt = 0;
};

const createSensorReadingFromHardware = async ({
  soilRaw,
  soilMoisture,
  soilCondition,
  soilSensorOk,
  temperature,
  humidity,
  dhtSensorOk,
  location,
  cropKey,
}) => {
  const weatherData = await getCachedCurrentWeather() || {};
  // A cropKey sent by the device wins; otherwise the crop selected on the dashboard.
  const settings = await FarmSettings.getSettings();
  const crop = await getCropByKey(cropKey || settings?.activeCropKey);
  const sensorTemperature = dhtSensorOk ? temperature : null;

  const decision = decideIrrigation({
    soilSensorOk,
    soilMoisture,
    temperature: sensorTemperature,
    rainfall: weatherData.rainfall,
    forecastRainMm: weatherData.forecastRainMm,
    forecastRainChance: weatherData.forecastRainChance,
    forecastWindowHours: weatherData.forecastWindowHours,
    crop,
  });

  return SensorData.create({
    ...weatherData,
    location: location || weatherData.location || null,
    soilRaw,
    soilMoisture,
    soilCondition,
    soilSensorOk,
    temperature: sensorTemperature,
    humidity: dhtSensorOk ? humidity : null,
    dhtSensorOk,
    cropKey: crop.key,
    cropName: crop.name,
    decision,
    // Kept for API compatibility. pumpStatus is a RECOMMENDATION, not the real pump state.
    pumpStatus: decision.pumpRecommended ? "ON" : "OFF",
    recommendation: decision.message,
  });
};

module.exports = {
  createSensorReadingFromHardware,
  getCurrentWeather,
  getCachedCurrentWeather,
  clearWeatherCache,
  summariseForecast,
};
