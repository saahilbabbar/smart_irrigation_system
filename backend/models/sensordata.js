const mongoose = require("mongoose");

const SensorDataSchema = new mongoose.Schema({
  location: {
    type: String,
    default: "Ratnagiri, Maharashtra",
  },

  soilMoisture: {
    type: Number,
    required: true,
  },

  temperature: {
    type: Number,
    required: true,
  },

  humidity: {
    type: Number,
    required: true,
  },

  waterTankLevel: {
    type: Number,
    required: true,
  },

  pumpStatus: {
    type: String,
    enum: ["ON", "OFF"],
    default: "OFF",
  },

  rainfall: {
    type: Number,
    default: 0,
  },

  cloud: {
    type: Number,
    default: 0,
  },

  windSpeed: {
    type: Number,
    default: 0,
  },

  weatherCondition: {
    type: String,
    default: "Clear",
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

module.exports = mongoose.model("SensorData", SensorDataSchema);
