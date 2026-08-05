const axios = require("axios");

const SensorData = require("../models/SensorData");

const WEATHER_LOCATION = "Ratnagiri, Maharashtra";

const fetchAndStoreWeatherData = async () => {

  try {

    const weatherResponse = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${encodeURIComponent(WEATHER_LOCATION)}`
    );

    const weather = weatherResponse.data.current;

    const temperature = weather.temp_c;

    const humidity = weather.humidity;

    const rainfall = weather.precip_mm;

    const cloud = weather.cloud;

    const windSpeed = weather.wind_kph;

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

    if (
      soilMoisture < 35 &&
      rainfall < 1 &&
      waterTankLevel > 20
    ) {
      pumpStatus = "ON";
    }

    // AI Recommendation

    let recommendation = "";

    if (rainfall > 3) {

      recommendation =
        "Rain detected. Irrigation temporarily suspended.";

    } else if (soilMoisture < 30) {

      recommendation =
        "Soil moisture critically low. Irrigation required immediately.";

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

        pumpStatus,

        recommendation,

        weatherCondition:
          weather.condition.text,

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
};
