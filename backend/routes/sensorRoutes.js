const express = require("express");

const router = express.Router();

const SensorData = require(
  "../models/SensorData"
);

// Latest Data

router.get("/", async (req, res) => {

  try {

    const latestData =
      await SensorData.findOne()
        .sort({ createdAt: -1 });

    res.json(latestData);

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch data",
    });

  }

});

// History

router.get("/history", async (req, res) => {

  try {

    const history =
      await SensorData.find()
        .sort({ createdAt: -1 })
        .limit(20);

    res.json(history.reverse());

  } catch (error) {

    res.status(500).json({
      error: "Failed to fetch history",
    });

  }

});

module.exports = router;
