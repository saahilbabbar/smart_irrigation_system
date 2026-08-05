require("dotenv").config();

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const {
  fetchAndStoreWeatherData,
} = require(
  "./services/weatherService"
);
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const sensorRoutes = require("./routes/sensorRoutes");

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

/*
  ROUTES
*/

app.use("/api/auth", authRoutes);

app.use("/api/sensors", sensorRoutes);

/*
  ROOT ROUTE
*/

app.get("/", (req, res) => {
  res.send("Smart Irrigation API Running");
});

/*
  SERVER
*/

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initial Fetch

fetchAndStoreWeatherData();

// Automatic Background Collection

setInterval(() => {

  fetchAndStoreWeatherData();

}, 60000);