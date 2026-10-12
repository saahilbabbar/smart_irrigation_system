import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  const [cropOptions, setCropOptions] = useState([]);
  const [selectedCropKey, setSelectedCropKey] = useState("sugarcane");
  const [customCrop, setCustomCrop] = useState({
    name: "", minMoisture: "", maxMoisture: "", waterRequirement: "", waterRequirementUnit: "mm/week",
  });
  const [isSavingCustomCrop, setIsSavingCustomCrop] = useState(false);
  const [customCropSaveMessage, setCustomCropSaveMessage] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const dashboardRef = useRef(null);
  const analyticsRef = useRef(null);
  const irrigationRef = useRef(null);
  const sensorsRef = useRef(null);
  const reportsRef = useRef(null);

  const fetchCropRequirements = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/crops`);
      setCropOptions(response.data || []);
    } catch (error) {
      console.log("Crop Requirements Fetch Error:", error);
    }
  }, []);

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
      fetchCropRequirements();
    }, 0);

    const interval = setInterval(() => {
      fetchSensorData();
    }, 5000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchHistoryData, fetchSensorData, fetchCropRequirements]);

  const customCropError = useMemo(() => {
    if (selectedCropKey !== "custom") return "";
    const min = Number(customCrop.minMoisture);
    const max = Number(customCrop.maxMoisture);
    const water = Number(customCrop.waterRequirement);
    if (!customCrop.name.trim()) return "Enter a crop name.";
    if (!Number.isFinite(min) || min < 0 || min > 100) return "Minimum moisture must be between 0 and 100%.";
    if (!Number.isFinite(max) || max < 0 || max > 100 || min >= max) return "Maximum moisture must be higher than the minimum and at most 100%.";
    if (!Number.isFinite(water) || water <= 0) return "Water requirement must be greater than zero.";
    if (!customCrop.waterRequirementUnit.trim()) return "Enter a water unit.";
    return "";
  }, [customCrop, selectedCropKey]);

  const selectedCrop = useMemo(() => {
    if (selectedCropKey === "custom") {
      if (customCropError) return null;
      return {
        key: "custom", name: customCrop.name.trim(), minMoisture: Number(customCrop.minMoisture),
        maxMoisture: Number(customCrop.maxMoisture), waterRequirement: Number(customCrop.waterRequirement),
        waterRequirementUnit: customCrop.waterRequirementUnit.trim(),
      };
    }
    return cropOptions.find((crop) => crop.key === selectedCropKey) || null;
  }, [cropOptions, customCrop, customCropError, selectedCropKey]);

  const irrigationDecision = useMemo(() => {
    if (!sensorData || !selectedCrop) return null;
    const rainfall = sensorData.rainfall || 0;
    const tankLevel = sensorData.waterTankLevel || 0;
    const moisture = sensorData.soilMoisture || 0;
    if (rainfall >= 1) return { status: "SUSPENDED", message: "Rain detected — irrigation suspended." };
    if (tankLevel <= 20) return { status: "REFILL TANK", message: "Water tank is low. Refill before running irrigation." };
    if (moisture < selectedCrop.minMoisture) return { status: "IRRIGATION REQUIRED", message: `Soil moisture is below the ${selectedCrop.name} target. Irrigation required.` };
    if (moisture <= selectedCrop.maxMoisture) return { status: "MOISTURE ADEQUATE", message: `Soil moisture is within the ${selectedCrop.name} target range.` };
    return { status: "NO IRRIGATION", message: `Soil moisture is above the ${selectedCrop.name} target range. No irrigation required.` };
  }, [sensorData, selectedCrop]);

  const saveCustomCrop = async () => {
    if (customCropError) return;

    setIsSavingCustomCrop(true);
    setCustomCropSaveMessage("");

    try {
      const response = await axios.post(`${API_BASE_URL}/crops/custom`, {
        name: customCrop.name.trim(),
        minMoisture: Number(customCrop.minMoisture),
        maxMoisture: Number(customCrop.maxMoisture),
        waterRequirement: Number(customCrop.waterRequirement),
        waterRequirementUnit: customCrop.waterRequirementUnit.trim(),
      });

      const savedCrop = response.data;
      setCropOptions((currentCrops) => [...currentCrops, savedCrop]);
      setSelectedCropKey(savedCrop.key);
      setCustomCropSaveMessage(`${savedCrop.name} saved to MongoDB.`);
    } catch (error) {
      setCustomCropSaveMessage(error.response?.data?.error || "Could not save the custom crop.");
    } finally {
      setIsSavingCustomCrop(false);
    }
  };

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

  const COLORS = ["#f6bdc8", "#8ed6b3"];

  const sections = {
    dashboard: dashboardRef,
    analytics: analyticsRef,
    irrigation: irrigationRef,
    sensors: sensorsRef,
    reports: reportsRef,
  };

  const navigateTo = (section) => {
    setActiveSection(section);
    sections[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navItems = [
    ["dashboard", "⌂", "Dashboard"],
    ["analytics", "◌", "Analytics"],
    ["irrigation", "⌁", "Irrigation"],
    ["sensors", "◉", "Sensors"],
    ["reports", "✦", "Reports"],
  ];

  return (
    <div style={styles.app}>
      {/* SIDEBAR */}

      <aside style={styles.sidebar}>
        <h2 style={styles.logo}>
          <span style={styles.logoMark}>✦</span> SmartFarm
        </h2>
        <p style={styles.sidebarCaption}>Grow smarter, gently.</p>

        <nav style={styles.menu} aria-label="Dashboard sections">
          {navItems.map(([section, icon, label]) => (
            <button
              key={section}
              type="button"
              onClick={() => navigateTo(section)}
              style={{
                ...styles.navButton,
                ...(activeSection === section ? styles.navButtonActive : {}),
              }}
            >
              <span style={styles.navIcon}>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>Live field insights<br />updated every 5 seconds</div>
      </aside>

      {/* MAIN */}

      <div style={styles.main}>
        <motion.h1
          ref={dashboardRef}
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
                color="#68be96"
              />

              <DashboardCard
                title="Temperature"
                value={`${sensorData.temperature || 0}°C`}
                icon={<FaTemperatureHigh />}
                color="#eca06b"
              />

              <DashboardCard
                title="Humidity"
                value={`${sensorData.humidity || 0}%`}
                icon={<FaTint />}
                color="#6abed3"
              />

              <DashboardCard
                title="Water Tank"
                value={`${sensorData.waterTankLevel || 0}%`}
                icon={<FaWater />}
                color="#8aaef0"
              />

              <DashboardCard
                title="Irrigation Status"
                value={irrigationDecision?.status || "SELECT CROP"}
                icon={<FaPowerOff />}
                color={
                  irrigationDecision?.status === "IRRIGATION REQUIRED"
                    ? "#68be96"
                    : "#e99aab"
                }
              />
            </div>

            <motion.div ref={irrigationRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.cropCard}>
              <h2>🌾 Crop-aware Irrigation</h2>
              <label style={styles.cropLabel} htmlFor="crop-select">Crop being monitored</label>
              <select id="crop-select" value={selectedCropKey} onChange={(event) => { setSelectedCropKey(event.target.value); setCustomCropSaveMessage(""); }} style={styles.cropSelect}>
                {cropOptions.map((crop) => <option key={crop.key} value={crop.key}>{crop.name}</option>)}
                <option value="custom">Custom Crop</option>
              </select>

              {selectedCropKey === "custom" && (
                <div style={styles.customCropGrid}>
                  <input placeholder="Crop name" value={customCrop.name} onChange={(event) => setCustomCrop({ ...customCrop, name: event.target.value })} style={styles.cropInput} />
                  <input type="number" min="0" max="100" placeholder="Minimum moisture %" value={customCrop.minMoisture} onChange={(event) => setCustomCrop({ ...customCrop, minMoisture: event.target.value })} style={styles.cropInput} />
                  <input type="number" min="0" max="100" placeholder="Maximum moisture %" value={customCrop.maxMoisture} onChange={(event) => setCustomCrop({ ...customCrop, maxMoisture: event.target.value })} style={styles.cropInput} />
                  <input type="number" min="0" placeholder="Water requirement" value={customCrop.waterRequirement} onChange={(event) => setCustomCrop({ ...customCrop, waterRequirement: event.target.value })} style={styles.cropInput} />
                  <input placeholder="Unit (e.g. mm/week)" value={customCrop.waterRequirementUnit} onChange={(event) => setCustomCrop({ ...customCrop, waterRequirementUnit: event.target.value })} style={styles.cropInput} />
                  {customCropError && <p style={styles.validationError}>{customCropError}</p>}
                  <button type="button" onClick={saveCustomCrop} disabled={Boolean(customCropError) || isSavingCustomCrop} style={styles.saveCropButton}>
                    {isSavingCustomCrop ? "Saving..." : "Save Custom Crop"}
                  </button>
                </div>
              )}

              {customCropSaveMessage && <p style={styles.saveMessage}>{customCropSaveMessage}</p>}

              {selectedCrop && (
                <div style={styles.cropInfoGrid}>
                  <div><h3>Selected Crop</h3><p>{selectedCrop.name}</p></div>
                  <div><h3>Indicative Water Need</h3><p>{selectedCrop.waterRequirement} {selectedCrop.waterRequirementUnit}</p></div>
                  <div><h3>Target Soil Moisture</h3><p>{selectedCrop.minMoisture}% – {selectedCrop.maxMoisture}%</p></div>
                  <div><h3>Current Soil Moisture</h3><p>{sensorData.soilMoisture || 0}%</p></div>
                  <div><h3>Recommendation</h3><p>{irrigationDecision?.message}</p></div>
                </div>
              )}
              <p style={styles.indicativeNote}>Water requirements are indicative reference values; adjust them for local soil, climate, and crop stage.</p>
            </motion.div>

            {/* ENVIRONMENT SECTION */}

            <motion.div
              ref={sensorsRef}
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
                  {irrigationDecision?.message || sensorData.recommendation ||
                    "Soil moisture is stable. Irrigation system operating normally."}
                </p>
              </div>
            </motion.div>

            {/* CHARTS */}

            <div ref={analyticsRef} style={styles.chartGrid}>
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
                      stroke="#68be96"
                      fill="#bdebd2"
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
                      stroke="#eca06b"
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
                      fill="#8bcfdb"
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
              ref={reportsRef}
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
                      ? "#68be96"
                      : getHealthStatus() ===
                        "Moderate"
                      ? "#e3b85c"
                      : "#e99aab",
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
  const isIrrigationStatus = title === "Irrigation Status";

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

      <h1
        style={{
          ...styles.cardValue,
          ...(isIrrigationStatus
            ? styles.statusValue
            : styles.numericValue),
          color,
        }}
      >
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
    width: "100%",
    background: "linear-gradient(135deg, #f7fff9 0%, #edf9f4 48%, #f5f2ff 100%)",
    color: "#27413a",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },

  sidebar: {
    width: "240px",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    height: "100vh",
    minHeight: "100vh",
    boxSizing: "border-box",
    padding: "34px 20px 24px",
    background: "rgba(255, 255, 255, 0.72)",
    borderRight: "1px solid #dcece5",
    backdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
  },

  logo: {
    margin: 0,
    fontSize: "27px",
    color: "#2f7d62",
    letterSpacing: "-1px",
  },

  logoMark: { color: "#f3a8b7" },

  sidebarCaption: {
    margin: "9px 0 42px",
    color: "#78958b",
    fontSize: "13px",
  },

  menu: {
    display: "flex",
    flexDirection: "column",
    gap: "9px",
  },

  navButton: {
    width: "100%",
    border: "1px solid transparent",
    background: "transparent",
    color: "#55736a",
    borderRadius: "14px",
    padding: "13px 14px",
    textAlign: "left",
    fontSize: "15px",
    fontWeight: 650,
    cursor: "pointer",
    transition: "background 180ms ease, color 180ms ease, transform 180ms ease",
  },

  navButtonActive: {
    background: "#dff5e9",
    borderColor: "#c8ebd9",
    color: "#266b54",
    boxShadow: "0 6px 18px rgba(59, 126, 96, 0.1)",
  },

  navIcon: { display: "inline-block", width: "24px", color: "#e38e9f" },

  sidebarFooter: {
    marginTop: "auto",
    padding: "16px 12px",
    borderRadius: "14px",
    background: "#f1f8f4",
    color: "#78958b",
    fontSize: "12px",
    lineHeight: 1.55,
  },

  main: {
    flex: 1,
    minWidth: 0,
    padding: "42px clamp(24px, 4vw, 64px) 64px",
  },

  heading: {
    scrollMarginTop: "24px",
    fontSize: "clamp(32px, 4vw, 52px)",
    color: "#27413a",
    letterSpacing: "-2.2px",
    margin: "0 0 36px",
  },

  cards: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "18px",
    marginBottom: "28px",
  },

  card: {
    background: "rgba(255, 255, 255, 0.86)",
    border: "1px solid rgba(221, 237, 229, 0.9)",
    borderRadius: "22px",
    padding: "24px",
    boxShadow: "0 12px 30px rgba(55, 107, 83, 0.09)",
    transition: "0.25s ease",
  },

  cardIcon: {
    fontSize: "30px",
    marginBottom: "15px",
  },

  cardValue: {
    margin: "16px 0 0",
    fontWeight: 700,
  },

  numericValue: {
    fontSize: "clamp(40px, 4vw, 56px)",
    lineHeight: 1.1,
  },

  statusValue: {
    fontSize: "clamp(24px, 2.2vw, 34px)",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },

  recommendation: {
    scrollMarginTop: "24px",
    background: "linear-gradient(135deg, #dcf6e9, #ecf8f0)",
    color: "#285742",
    padding: "25px",
    borderRadius: "22px",
    marginBottom: "28px",
  },

  cropCard: {
    scrollMarginTop: "24px",
    background: "rgba(255, 255, 255, 0.88)",
    border: "1px solid #e0eee7",
    padding: "25px",
    borderRadius: "22px",
    marginBottom: "28px",
    boxShadow: "0 12px 30px rgba(55, 107, 83, 0.07)",
  },

  cropLabel: {
    display: "block",
    marginTop: "18px",
    marginBottom: "8px",
    color: "#55736a",
  },

  cropSelect: {
    width: "100%",
    maxWidth: "360px",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #c9e2d5",
    background: "#fbfffc",
    color: "#27413a",
    fontSize: "16px",
  },

  customCropGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "18px",
  },

  cropInput: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #c9e2d5",
    background: "#fbfffc",
    color: "#27413a",
    fontSize: "15px",
  },

  validationError: {
    gridColumn: "1 / -1",
    color: "#c76376",
  },

  cropInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginTop: "22px",
    textAlign: "left",
  },

  indicativeNote: {
    marginTop: "20px",
    color: "#6c8b80",
    fontSize: "14px",
  },

  saveCropButton: {
    justifySelf: "start",
    padding: "12px 18px",
    border: 0,
    borderRadius: "8px",
    background: "#a7dfc2",
    color: "#1e5540",
    fontWeight: 700,
    cursor: "pointer",
  },

  saveMessage: {
    marginTop: "14px",
    color: "#2f8a67",
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
    background: "rgba(255,255,255,0.64)",
    padding: "20px",
    borderRadius: "16px",
  },

  chartGrid: {
    scrollMarginTop: "24px",
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "18px",
  },

  chartCard: {
    background: "rgba(255, 255, 255, 0.88)",
    border: "1px solid #e0eee7",
    padding: "24px",
    borderRadius: "22px",
    boxShadow: "0 12px 30px rgba(55, 107, 83, 0.07)",
  },

  healthCard: {
    scrollMarginTop: "24px",
    marginTop: "35px",
    background: "linear-gradient(135deg, #f7e4eb, #eee9ff)",
    color: "#513e5b",
    padding: "30px",
    borderRadius: "22px",
    textAlign: "center",
  },
};

export default App;
