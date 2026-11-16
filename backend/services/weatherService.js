const axios = require("axios");

const SensorData = require("../models/sensordata");
const FarmLocation = require("../models/FarmLocation");
const { getCropByKey } = require("../config/crops");

const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedWeather = null;
let cachedWeatherAt = 0;
let lastWeatherAttemptAt = 0;

// Saved dashboard coordinates if set, otherwise WeatherAPI's IP lookup of the
// backend laptop's public IP (city-level accuracy).
const getWeatherQuery = async () => {
  const saved = await FarmLocation.findOne({ key: "default" }).lean();
  if (saved?.place) return saved.place;
  if (saved?.lat != null && saved?.lon != null) return `${saved.lat},${saved.lon}`;
  return "auto:ip";
};

const getCurrentWeather = async (query) => {
  const weatherResponse = await axios.get(
    "https://api.weatherapi.com/v1/current.json",
    {
      params: { key: process.env.WEATHER_API_KEY, q: query ?? await getWeatherQuery() },
      timeout: 4000,
    }
  );

  const { current: weather, location: place } = weatherResponse.data;

  return {
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

const buildRecommendation = ({
  soilMoisture,
  temperature,
  rainfall,
  crop,
}) => {
  if (soilMoisture === null || soilMoisture === undefined) {
    return "Soil sensor unavailable. Irrigation recommendation paused.";
  }

  if (rainfall !== null && rainfall !== undefined && rainfall >= 1) {
    return "Rain detected. Irrigation temporarily suspended.";
  }

  if (soilMoisture < crop.minMoisture) {
    return `Soil moisture is below the ${crop.name} target. Irrigation required.`;
  }

  if (soilMoisture <= crop.maxMoisture) {
    return `Soil moisture is adequate for ${crop.name}.`;
  }

  if (temperature > 35) {
    return "High temperature detected. Monitor moisture and irrigation frequency.";
  }

  return `Soil moisture is above the ${crop.name} target range. No irrigation required.`;
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
  const crop = await getCropByKey(cropKey);

  const pumpStatus =
    soilSensorOk &&
    soilMoisture < crop.minMoisture &&
    (weatherData.rainfall == null || weatherData.rainfall < 1)
      ? "ON"
      : "OFF";

  return SensorData.create({
    ...weatherData,
    location: location || weatherData.location || null,
    soilRaw,
    soilMoisture,
    soilCondition,
    soilSensorOk,
    temperature: dhtSensorOk ? temperature : null,
    humidity: dhtSensorOk ? humidity : null,
    dhtSensorOk,
    cropKey: crop.key,
    cropName: crop.name,
    pumpStatus,
    recommendation: buildRecommendation({
      soilMoisture,
      temperature: dhtSensorOk ? temperature : null,
      rainfall: weatherData.rainfall,
      crop,
    }),
  });
};

module.exports = {
  createSensorReadingFromHardware,
  getCurrentWeather,
  getCachedCurrentWeather,
  clearWeatherCache,
};
