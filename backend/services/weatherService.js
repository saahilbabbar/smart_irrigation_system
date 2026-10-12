const axios = require("axios");

const SensorData = require("../models/sensordata");
const { getCrop, getCropByKey } = require("../config/crops");

const WEATHER_LOCATION = "Ratnagiri, Maharashtra";

const getCurrentWeather = async () => {
  const weatherResponse = await axios.get(
    `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(WEATHER_LOCATION)}`
  );

  const weather = weatherResponse.data.current;

  return {
    location: WEATHER_LOCATION,
    temperature: weather.temp_c,
    humidity: weather.humidity,
    rainfall: weather.precip_mm,
    cloud: weather.cloud,
    windSpeed: weather.wind_kph,
    weatherCondition: weather.condition.text,
  };
};

const buildRecommendation = ({
  soilMoisture,
  temperature,
  rainfall,
  waterTankLevel,
  crop,
}) => {
  if (rainfall >= 1) {
    return "Rain detected. Irrigation temporarily suspended.";
  }

  if (waterTankLevel <= 20) {
    return "Water tank is low. Refill before running the pump.";
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
  soilMoisture,
  waterTankLevel = 75,
  location,
  cropKey,
}) => {
  const weatherData = await getCurrentWeather();
  const crop = await getCropByKey(cropKey);

  const pumpStatus =
    soilMoisture < crop.minMoisture &&
    weatherData.rainfall < 1 &&
    waterTankLevel > 20
      ? "ON"
      : "OFF";

  return SensorData.create({
    ...weatherData,
    location: location || weatherData.location,
    soilMoisture,
    waterTankLevel,
    cropKey: crop.key,
    cropName: crop.name,
    pumpStatus,
    recommendation: buildRecommendation({
      soilMoisture,
      temperature: weatherData.temperature,
      rainfall: weatherData.rainfall,
      waterTankLevel,
      crop,
    }),
  });
};

const fetchAndStoreWeatherData = async () => {

  try {

    const {
      temperature,
      humidity,
      rainfall,
      cloud,
      windSpeed,
      weatherCondition,
    } = await getCurrentWeather();

    // Intelligent Soil Moisture Logic

    let soilMoisture = 50;

    soilMoisture += rainfall * 4;

    soilMoisture += humidity * 0.15;

    soilMoisture -= temperature * 0.5;

    soilMoisture -= windSpeed * 0.1;

    soilMoisture += cloud * 0.05;

    soilMoisture = Math.max(
      10,
      Math.min(100, Math.round(soilMoisture))
    );

    // Water Tank

    const waterTankLevel = 75;

    // Pump Logic

    let pumpStatus = "OFF";

    const crop = getCrop();

    if (
      soilMoisture < crop.minMoisture &&
      rainfall < 1 &&
      waterTankLevel > 20
    ) {
      pumpStatus = "ON";
    }

    // AI Recommendation

    let recommendation = "";

    if (rainfall >= 1) {

      recommendation =
        "Rain detected. Irrigation temporarily suspended.";

    } else if (waterTankLevel <= 20) {

      recommendation =
        "Water tank is low. Refill before running the pump.";

    } else if (soilMoisture < crop.minMoisture) {

      recommendation =
        `Soil moisture is below the ${crop.name} target. Irrigation required.`;

    } else if (temperature > 35) {

      recommendation =
        "High temperature detected. Increase irrigation frequency.";

    } else {

      recommendation =
        "Field conditions are stable. No immediate irrigation required.";

    }

    // Store in MongoDB

    const savedData =
      await SensorData.create({

        location: WEATHER_LOCATION,

        temperature,

        humidity,

        rainfall,

        cloud,

        windSpeed,

        soilMoisture,

        waterTankLevel,

        cropKey: crop.key,

        cropName: crop.name,

        pumpStatus,

        recommendation,

        weatherCondition,

      });

    console.log(
      "Weather data stored:",
      savedData._id
    );

    return savedData;

  } catch (error) {

    console.log(
      "Weather Service Error:",
      error.message
    );

  }

};

module.exports = {
  fetchAndStoreWeatherData,
  createSensorReadingFromHardware,
  getCurrentWeather,
};
