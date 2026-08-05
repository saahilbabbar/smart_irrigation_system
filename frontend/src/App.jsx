import { useEffect, useState, useCallback } from "react";
import axios from "axios";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

import { motion } from "framer-motion";

import {
  FaTint,
  FaTemperatureHigh,
  FaWater,
  FaPowerOff,
  FaSeedling,
} from "react-icons/fa";

const API_BASE_URL = "http://127.0.0.1:3001/api/sensors";

const formatHistoryPoint = (data) => ({
  id: data._id || data.createdAt,
  time: data.createdAt
    ? new Date(data.createdAt).toLocaleTimeString()
    : new Date().toLocaleTimeString(),
  moisture: data.soilMoisture || 0,
  temperature: data.temperature || 0,
  humidity: data.humidity || 0,
  tank: data.waterTankLevel || 0,
});

function App() {
  const [sensorData, setSensorData] = useState(null);

  const [history, setHistory] = useState([]);

  // FETCH STORED HISTORY
  const fetchHistoryData = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/history`
      );

      const storedHistory = response.data || [];

      setHistory(
        storedHistory.map((data) =>
          formatHistoryPoint(data)
        )
      );

      if (storedHistory.length > 0) {
        setSensorData(
          storedHistory[storedHistory.length - 1]
        );
      }
    } catch (error) {
      console.log("History Fetch Error:", error);
    }
  }, []);

  // FETCH SENSOR DATA
  const fetchSensorData = useCallback(async () => {
    try {
      const response = await axios.get(
        API_BASE_URL
      );

      console.log("Sensor API Response:", response.data);

      if (!response.data) return;

      setSensorData(response.data);

      const nextPoint = formatHistoryPoint(
        response.data
      );

      setHistory((prev) => {
        const alreadyExists = prev.some(
          (item) => item.id === nextPoint.id
        );

        if (alreadyExists) return prev;

        return [...prev.slice(-19), nextPoint];
      });
    } catch (error) {
      console.log("Sensor Fetch Error:", error);
    }
  }, []);

  // RUN ONCE + REFRESH DATA EVERY 5 SEC
  useEffect(() => {
    const initialFetch = setTimeout(() => {
      fetchHistoryData();
      fetchSensorData();
    }, 0);

    const interval = setInterval(() => {
      fetchSensorData();
    }, 5000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchHistoryData, fetchSensorData]);

  // SYSTEM HEALTH
  const getHealthStatus = () => {
    if (!sensorData) return "Loading";

    if (
      sensorData.soilMoisture > 60 &&
      sensorData.waterTankLevel > 40
    ) {
      return "Excellent";
    }

    if (sensorData.soilMoisture > 35) {
      return "Moderate";
    }

    return "Critical";
  };

  // PIE CHART DATA
  const pieData = sensorData
    ? [
        {
          name: "Used",
          value:
            100 -
            (sensorData.waterTankLevel || 0),
        },
        {
          name: "Remaining",
          value:
            sensorData.waterTankLevel || 0,
        },
      ]
    : [];

  const COLORS = ["#ef4444", "#22c55e"];

  return (
    <div style={styles.app}>
      {/* SIDEBAR */}

      <div style={styles.sidebar}>
        <h2 style={styles.logo}>
          🌱 SmartFarm
        </h2>

        <div style={styles.menu}>
          <p>Dashboard</p>
          <p>Analytics</p>
          <p>Irrigation</p>
          <p>Sensors</p>
          <p>Reports</p>
        </div>
      </div>

      {/* MAIN */}

      <div style={styles.main}>
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={styles.heading}
        >
          Smart Irrigation Monitoring System
        </motion.h1>

        {!sensorData ? (
          <h2>Loading Sensor Data...</h2>
        ) : (
          <>
            {/* TOP CARDS */}

            <div style={styles.cards}>
              <DashboardCard
                title="Soil Moisture"
                value={`${sensorData.soilMoisture || 0}%`}
                icon={<FaSeedling />}
                color="#22c55e"
              />

              <DashboardCard
                title="Temperature"
                value={`${sensorData.temperature || 0}°C`}
                icon={<FaTemperatureHigh />}
                color="#f97316"
              />

              <DashboardCard
                title="Humidity"
                value={`${sensorData.humidity || 0}%`}
                icon={<FaTint />}
                color="#06b6d4"
              />

              <DashboardCard
                title="Water Tank"
                value={`${sensorData.waterTankLevel || 0}%`}
                icon={<FaWater />}
                color="#3b82f6"
              />

              <DashboardCard
                title="Pump Status"
                value={
                  sensorData.pumpStatus || "OFF"
                }
                icon={<FaPowerOff />}
                color={
                  sensorData.pumpStatus === "ON"
                    ? "#22c55e"
                    : "#ef4444"
                }
              />
            </div>

            {/* ENVIRONMENT SECTION */}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={styles.recommendation}
            >
              <h2>
                🌍 Live Environmental Intelligence
              </h2>

              <div style={styles.infoGrid}>
                <div>
                  <h3>📍 Location</h3>

                  <p>
                    {sensorData.location ||
                      "Mumbai, India"}
                  </p>
                </div>

                <div>
                  <h3>☁ Weather</h3>

                  <p>
                    {sensorData.weatherCondition ||
                      "Clear Sky"}
                  </p>
                </div>

                <div>
                  <h3>🌧 Rainfall</h3>

                  <p>
                    {sensorData.rainfall || 0} mm
                  </p>
                </div>

                <div>
                  <h3>💨 Wind Speed</h3>

                  <p>
                    {sensorData.windSpeed || 0}{" "}
                    kph
                  </p>
                </div>

                <div>
                  <h3>🕒 Last Updated</h3>

                  <p>
                    {sensorData.lastUpdated ||
                      new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <div style={styles.aiBox}>
                <h3>🤖 AI Recommendation</h3>

                <p style={styles.recommendationText}>
                  {sensorData.recommendation ||
                    "Soil moisture is stable. Irrigation system operating normally."}
                </p>
              </div>
            </motion.div>

            {/* CHARTS */}

            <div style={styles.chartGrid}>
              {/* MOISTURE */}

              <div style={styles.chartCard}>
                <h2>Soil Moisture Trend</h2>

                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <AreaChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="time" />

                    <YAxis />

                    <Tooltip />

                    <Area
                      type="monotone"
                      dataKey="moisture"
                      stroke="#22c55e"
                      fill="#22c55e"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* TEMPERATURE */}

              <div style={styles.chartCard}>
                <h2>Temperature Trend</h2>

                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="time" />

                    <YAxis />

                    <Tooltip />

                    <Line
                      type="monotone"
                      dataKey="temperature"
                      stroke="#f97316"
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* HUMIDITY */}

              <div style={styles.chartCard}>
                <h2>Humidity Analytics</h2>

                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <BarChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="time" />

                    <YAxis />

                    <Tooltip />

                    <Legend />

                    <Bar
                      dataKey="humidity"
                      fill="#06b6d4"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* WATER TANK */}

              <div style={styles.chartCard}>
                <h2>Water Tank Usage</h2>

                <ResponsiveContainer
                  width="100%"
                  height={300}
                >
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label
                    >
                      {pieData.map(
                        (entry, index) => (
                          <Cell
                            key={index}
                            fill={COLORS[index]}
                          />
                        )
                      )}
                    </Pie>

                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* SYSTEM HEALTH */}

            <motion.div
              whileHover={{ scale: 1.02 }}
              style={styles.healthCard}
            >
              <h2>
                🌍 System Health Status
              </h2>

              <h1
                style={{
                  color:
                    getHealthStatus() ===
                    "Excellent"
                      ? "#22c55e"
                      : getHealthStatus() ===
                        "Moderate"
                      ? "#facc15"
                      : "#ef4444",
                }}
              >
                {getHealthStatus()}
              </h1>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

// DASHBOARD CARD

function DashboardCard({
  title,
  value,
  icon,
  color,
}) {
  return (
    <motion.div
      whileHover={{
        scale: 1.05,
      }}
      style={{
        ...styles.card,
        borderTop: `5px solid ${color}`,
      }}
    >
      <div style={styles.cardIcon}>
        {icon}
      </div>

      <h3>{title}</h3>

      <h1 style={{ color }}>
        {value}
      </h1>
    </motion.div>
  );
}

// STYLES

const styles = {
  app: {
    display: "flex",
    minHeight: "100vh",
    background: "#0f172a",
    color: "white",
    fontFamily: "Arial",
  },

  sidebar: {
    width: "240px",
    background: "#020617",
    padding: "30px 20px",
    borderRight: "1px solid #1e293b",
  },

  logo: {
    marginBottom: "50px",
    fontSize: "28px",
    color: "#22c55e",
  },

  menu: {
    display: "flex",
    flexDirection: "column",
    gap: "25px",
    fontSize: "18px",
    color: "#cbd5e1",
  },

  main: {
    flex: 1,
    padding: "30px",
  },

  heading: {
    fontSize: "42px",
    marginBottom: "30px",
  },

  cards: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "20px",
    marginBottom: "35px",
  },

  card: {
    background: "rgba(255,255,255,0.06)",
    borderRadius: "20px",
    padding: "25px",
    backdropFilter: "blur(10px)",
    boxShadow:
      "0 8px 20px rgba(0,0,0,0.35)",
    transition: "0.3s",
  },

  cardIcon: {
    fontSize: "30px",
    marginBottom: "15px",
  },

  recommendation: {
    background:
      "linear-gradient(to right, #14532d, #166534)",
    padding: "25px",
    borderRadius: "20px",
    marginBottom: "35px",
  },

  recommendationText: {
    marginTop: "10px",
    fontSize: "18px",
    lineHeight: "1.7",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "20px",
    marginTop: "20px",
  },

  aiBox: {
    marginTop: "25px",
    background: "rgba(255,255,255,0.08)",
    padding: "20px",
    borderRadius: "15px",
  },

  chartGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(500px, 1fr))",
    gap: "25px",
  },

  chartCard: {
    background: "rgba(255,255,255,0.06)",
    padding: "25px",
    borderRadius: "20px",
    backdropFilter: "blur(10px)",
  },

  healthCard: {
    marginTop: "35px",
    background:
      "linear-gradient(to right, #1e293b, #334155)",
    padding: "30px",
    borderRadius: "20px",
    textAlign: "center",
  },
};

export default App;
