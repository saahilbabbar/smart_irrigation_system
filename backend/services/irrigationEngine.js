// Single source of truth for irrigation decisions. Pure function: no DB, no
// network, so it is unit-tested and the dashboard only displays its output.
//
// Inputs come from real measurements only: soil moisture from the soil sensor,
// temperature from the DHT22, rainfall from WeatherAPI current conditions.

const RAIN_DELAY_MM = 1;      // current precipitation at/above this delays irrigation
const HIGH_TEMP_C = 35;       // adds an evaporation note to the reasons

const STATUS = {
  PAUSED: "SOIL SENSOR OFFLINE",
  DELAY: "IRRIGATION DELAYED",
  IRRIGATE: "IRRIGATION REQUIRED",
  SUFFICIENT: "MOISTURE ADEQUATE",
  NOT_NEEDED: "NO IRRIGATION",
};

const decideIrrigation = ({ soilSensorOk, soilMoisture, temperature, rainfall, crop }) => {
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
  const reasons = [
    `Soil moisture is ${soilMoisture}%, ${crop.minMoisture - soilMoisture} points below the ${crop.name} minimum of ${crop.minMoisture}%.`,
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

  if (temperature != null && temperature > HIGH_TEMP_C) {
    reasons.push(`Air temperature is high (${temperature}°C, DHT22), which increases evaporation.`);
  }

  return result("IRRIGATE", `Soil moisture is below the ${crop.name} target. Irrigation required.`, reasons);
};

module.exports = { decideIrrigation };
