// Single source of truth for irrigation decisions. Pure function: no DB, no
// network, so it is unit-tested and the dashboard only displays its output.
//
// Inputs come from real measurements only: soil moisture from the soil sensor,
// temperature from the DHT22, current rainfall and hourly forecast from WeatherAPI.
//
// Thresholds are indicative starting values; tune them from field observations.

const RAIN_DELAY_MM = 1;            // current precipitation at/above this delays irrigation
const FORECAST_RAIN_MM = 2;         // forecast rain total in the window that justifies waiting
const FORECAST_RAIN_CHANCE = 60;    // ...only if the max hourly chance of rain is at least this (%)
const CRITICAL_DEFICIT_POINTS = 15; // this far below the crop minimum: irrigate even if rain is forecast
const HIGH_TEMP_C = 35;             // adds an evaporation note to the reasons

const STATUS = {
  PAUSED: "SOIL SENSOR OFFLINE",
  DELAY: "IRRIGATION DELAYED",
  IRRIGATE: "IRRIGATION REQUIRED",
  SUFFICIENT: "MOISTURE ADEQUATE",
  NOT_NEEDED: "NO IRRIGATION",
};

const decideIrrigation = ({
  soilSensorOk,
  soilMoisture,
  temperature,
  rainfall,
  forecastRainMm,
  forecastRainChance,
  forecastWindowHours,
  crop,
}) => {
  const cropInfo = {
    key: crop.key,
    name: crop.name,
    minMoisture: crop.minMoisture,
    maxMoisture: crop.maxMoisture,
  };
  const result = (action, message, reasons) => ({
    action,
    status: STATUS[action],
    message,
    reasons,
    pumpRecommended: action === "IRRIGATE",
    crop: cropInfo,
  });

  if (!soilSensorOk || soilMoisture == null) {
    return result("PAUSED", "Soil sensor unavailable. Irrigation recommendation paused.", [
      "The soil moisture sensor is offline, so no irrigation decision can be made safely.",
    ]);
  }

  const range = `${crop.name} target range of ${crop.minMoisture}–${crop.maxMoisture}%`;

  if (soilMoisture > crop.maxMoisture) {
    return result("NOT_NEEDED", `Soil moisture is above the ${crop.name} target range. No irrigation required.`, [
      `Soil moisture is ${soilMoisture}%, above the ${range}.`,
    ]);
  }

  if (soilMoisture >= crop.minMoisture) {
    return result("SUFFICIENT", `Soil moisture is within the ${crop.name} target range.`, [
      `Soil moisture is ${soilMoisture}%, within the ${range}.`,
    ]);
  }

  // Below minimum from here on.
  const deficit = crop.minMoisture - soilMoisture;
  const reasons = [
    `Soil moisture is ${soilMoisture}%, ${deficit} points below the ${crop.name} minimum of ${crop.minMoisture}%.`,
  ];

  if (rainfall != null && rainfall >= RAIN_DELAY_MM) {
    reasons.push(`It is raining now (${rainfall} mm, WeatherAPI), so irrigation is delayed to avoid wasting water.`);
    return result("DELAY", "Rain detected. Irrigation delayed until the rain stops.", reasons);
  }

  if (rainfall == null) {
    reasons.push("Weather data unavailable; rainfall was not considered.");
  } else {
    reasons.push(`No significant rain right now (${rainfall} mm, WeatherAPI).`);
  }

  const forecastKnown = forecastRainMm != null && forecastRainChance != null;
  const window = `${forecastWindowHours} h`;
  const forecastText = `${forecastRainMm} mm within the next ${window}, ${forecastRainChance}% chance`;

  if (!forecastKnown) {
    reasons.push("Rain forecast unavailable; upcoming rain was not considered.");
  } else if (forecastRainMm >= FORECAST_RAIN_MM && forecastRainChance >= FORECAST_RAIN_CHANCE) {
    if (deficit <= CRITICAL_DEFICIT_POINTS) {
      reasons.push(`Rain is forecast (${forecastText}, WeatherAPI), which should raise soil moisture without irrigating.`);
      return result("DELAY", "Rain expected soon. Irrigation delayed to save water.", reasons);
    }
    reasons.push(`Rain is forecast (${forecastText}, WeatherAPI), but the soil is critically dry (more than ${CRITICAL_DEFICIT_POINTS} points below the minimum), so irrigating now.`);
  } else {
    reasons.push(`No significant rain forecast (${forecastText}, WeatherAPI).`);
  }

  if (temperature != null && temperature > HIGH_TEMP_C) {
    reasons.push(`Air temperature is high (${temperature}°C, DHT22), which increases evaporation.`);
  }

  return result("IRRIGATE", `Soil moisture is below the ${crop.name} target. Irrigation required.`, reasons);
};

module.exports = { decideIrrigation };
