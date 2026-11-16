const mongoose = require("mongoose");

const SensorDataSchema = new mongoose.Schema({
  location: {
    type: String,
    default: null,
  },

  soilMoisture: {
    type: Number,
    default: null,
  },

  soilRaw: {
    type: Number,
    default: null,
  },

  soilCondition: {
    type: String,
    enum: ["DRY", "MOIST", "WET", null],
    default: null,
  },

  soilSensorOk: {
    type: Boolean,
    default: null,
  },

  dhtSensorOk: {
    type: Boolean,
    default: null,
  },

  temperature: {
    type: Number,
    default: null,
  },

  humidity: {
    type: Number,
    default: null,
  },

  cropKey: {
    type: String,
    default: "sugarcane",
  },

  cropName: {
    type: String,
    default: "Sugarcane",
  },

  pumpStatus: {
    type: String,
    enum: ["ON", "OFF"],
    default: "OFF",
  },

  rainfall: {
    type: Number,
    default: null,
  },

  cloud: {
    type: Number,
    default: null,
  },

  windSpeed: {
    type: Number,
    default: null,
  },

  // WeatherAPI air temperature/humidity: external context, NOT sensor readings.
  weatherTemperature: {
    type: Number,
    default: null,
  },

  weatherHumidity: {
    type: Number,
    default: null,
  },

  // WeatherAPI hourly forecast summary for the next forecastWindowHours.
  forecastRainMm: {
    type: Number,
    default: null,
  },

  forecastRainChance: {
    type: Number,
    default: null,
  },

  forecastWindowHours: {
    type: Number,
    default: null,
  },

  weatherCondition: {
    type: String,
    default: null,
  },

  // Output of services/irrigationEngine at ingestion time (the crop in effect then).
  decision: {
    type: new mongoose.Schema({
      action: String,
      status: String,
      message: String,
      reasons: [String],
      pumpRecommended: Boolean,
      crop: {
        key: String,
        name: String,
        minMoisture: Number,
        maxMoisture: Number,
      },
    }, { _id: false }),
    default: null,
  },

  recommendation: {
    type: String,
    default: "",
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Latest/history/export queries filter on soilSensorOk and sort/range on createdAt.
SensorDataSchema.index({ createdAt: -1 });

module.exports = mongoose.model("SensorData", SensorDataSchema);
