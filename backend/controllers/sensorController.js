const SensorData = require("../models/SensorData");

exports.getSensorData = async (req, res) => {
  try {

    const soilMoisture = Math.floor(Math.random() * 100);

    const temperature = Math.floor(Math.random() * 15) + 20;

    const humidity = Math.floor(Math.random() * 40) + 40;

    const waterTankLevel = Math.floor(Math.random() * 100);

    const pumpStatus = soilMoisture < 30 ? "ON" : "OFF";

    const sensorData = await SensorData.create({
      soilMoisture,
      temperature,
      humidity,
      waterTankLevel,
      pumpStatus,
    });

    res.status(200).json(sensorData);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};