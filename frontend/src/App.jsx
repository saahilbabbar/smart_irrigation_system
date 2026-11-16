import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import axios from "axios";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
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
  FaPowerOff,
  FaSeedling,
} from "react-icons/fa";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3001/api/sensors").replace(/\/$/, "");
const SETTINGS_URL = API_BASE_URL.replace(/\/sensors$/, "/settings");

// Keep the standard crop choices available while the API is starting or offline.
const BUILT_IN_CROPS = [
  { key: "sugarcane", name: "Sugarcane", minMoisture: 60, maxMoisture: 80, waterRequirement: 40, waterRequirementUnit: "mm/week" },
  { key: "wheat", name: "Wheat", minMoisture: 40, maxMoisture: 60, waterRequirement: 20, waterRequirementUnit: "mm/week" },
  { key: "rice", name: "Rice", minMoisture: 70, maxMoisture: 90, waterRequirement: 35, waterRequirementUnit: "mm/week" },
  { key: "potato", name: "Potato", minMoisture: 60, maxMoisture: 80, waterRequirement: 30, waterRequirementUnit: "mm/week" },
  { key: "onion", name: "Onion", minMoisture: 50, maxMoisture: 70, waterRequirement: 20, waterRequirementUnit: "mm/week" },
];

const formatHistoryPoint = (data) => ({
  id: data._id || data.createdAt,
  time: data.createdAt
    ? new Date(data.createdAt).toLocaleTimeString()
    : new Date().toLocaleTimeString(),
  moisture: data.soilMoisture ?? null,
  temperature: data.temperature ?? null,
  humidity: data.humidity ?? null,
});

function App() {
  const [sensorData, setSensorData] = useState(null);
  const [apiOnline, setApiOnline] = useState(null);
  const [sensorFetchError, setSensorFetchError] = useState("");
  const [clockNow, setClockNow] = useState(0);

  const [history, setHistory] = useState([]);
  const [cropOptions, setCropOptions] = useState(BUILT_IN_CROPS);
  const [selectedCropKey, setSelectedCropKey] = useState("sugarcane");
  const [customCrop, setCustomCrop] = useState({
    name: "", minMoisture: "", maxMoisture: "", waterRequirement: "", waterRequirementUnit: "mm/week",
  });
  const [isSavingCustomCrop, setIsSavingCustomCrop] = useState(false);
  const [customCropSaveMessage, setCustomCropSaveMessage] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [locationInfo, setLocationInfo] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [placeInput, setPlaceInput] = useState("");
  const dashboardRef = useRef(null);
  const analyticsRef = useRef(null);
  const irrigationRef = useRef(null);
  const sensorsRef = useRef(null);
  const reportsRef = useRef(null);

  const fetchCropRequirements = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/crops`);
      // Keep the built-in catalog even if the server only returns saved custom crops.
      const serverCrops = Array.isArray(response.data) ? response.data : [];
      const builtInKeys = new Set(BUILT_IN_CROPS.map((crop) => crop.key));
      setCropOptions([
        ...BUILT_IN_CROPS,
        ...serverCrops.filter((crop) => !builtInKeys.has(crop.key)),
      ]);
    } catch (error) {
      console.log("Crop Requirements Fetch Error:", error);
    }
  }, []);

  const fetchActiveCrop = useCallback(async () => {
    try {
      const response = await axios.get(`${SETTINGS_URL}/crop`);
      if (response.data?.key) setSelectedCropKey(response.data.key);
    } catch (error) {
      console.log("Active Crop Fetch Error:", error);
    }
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      const response = await axios.get(`${SETTINGS_URL}/location`);
      setLocationInfo(response.data);
    } catch (error) {
      console.log("Location Fetch Error:", error);
    }
  }, []);

  const saveLocation = async (body, successMessage) => {
    try {
      const response = await axios.put(`${SETTINGS_URL}/location`, body);
      setLocationInfo(response.data);
      setLocationMessage(successMessage);
      return true;
    } catch (error) {
      setLocationMessage(error.response?.data?.error || "Could not save the location.");
      return false;
    }
  };

  // Uses the browser's geolocation (on macOS: Wi-Fi positioning of this laptop).
  const useLaptopLocation = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationMessage("Location access needs the dashboard opened at http://localhost:5173 on this laptop.");
      return;
    }
    setIsLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await saveLocation(
          { lat: coords.latitude, lon: coords.longitude },
          "Laptop location saved. Weather for this place applies from the next sensor reading."
        );
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        const reasons = {
          1: "Permission denied. Allow location for this site in the browser, and enable your browser under System Settings → Privacy & Security → Location Services.",
          2: "macOS could not provide a position. Turn on Wi-Fi and Location Services, and allow your browser under System Settings → Privacy & Security → Location Services. Or type your area below.",
          3: "Timed out waiting for a position. Try again, or type your area below.",
        };
        setLocationMessage(`${reasons[error.code] || "Could not determine the laptop's location."} (${error.message || `code ${error.code}`})`);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 }
    );
  };

  const savePlace = async () => {
    if (!placeInput.trim()) return;
    setIsLocating(true);
    const saved = await saveLocation({ place: placeInput.trim() }, "Place saved. Weather for this place applies from the next sensor reading.");
    if (saved) setPlaceInput("");
    setIsLocating(false);
  };

  // FETCH STORED HISTORY
  const fetchHistoryData = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/history`
      );
      setApiOnline(true);

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

      setApiOnline(true);
      setSensorFetchError("");

      console.log("Sensor API Response:", response.data);

      if (!response.data) {
        setSensorData(null);
        setSensorFetchError("The backend is online, but no sensor readings have been received yet.");
        return;
      }

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
      setApiOnline(false);
      setSensorFetchError(error.response?.data?.error || "Could not reach the SmartFarm backend.");
    }
  }, []);

  // RUN ONCE + REFRESH DATA EVERY 5 SEC
  useEffect(() => {
    const initialFetch = setTimeout(() => {
      setClockNow(Date.now());
      fetchHistoryData();
      fetchSensorData();
      fetchCropRequirements();
      fetchActiveCrop();
      fetchLocation();
    }, 0);

    const interval = setInterval(() => {
      setClockNow(Date.now());
      fetchSensorData();
      fetchLocation();
    }, 5000);

    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchHistoryData, fetchSensorData, fetchCropRequirements, fetchActiveCrop, fetchLocation]);

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

  // The backend's irrigation engine is the single source of truth; the dashboard
  // only displays its decision for the active crop.
  const irrigationDecision = selectedCropKey === "custom"
    ? { status: "SAVE CROP", message: "Save the custom crop to get a recommendation for it.", reasons: [] }
    : sensorData?.currentDecision || null;

  const changeActiveCrop = async (cropKey) => {
    const previousKey = selectedCropKey;
    setSelectedCropKey(cropKey);
    if (cropKey === "custom") return;
    try {
      await axios.put(`${SETTINGS_URL}/crop`, { cropKey });
      fetchSensorData();
    } catch (error) {
      setSelectedCropKey(previousKey);
      setCustomCropSaveMessage(error.response?.data?.error || "Could not save the selected crop.");
    }
  };

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
      await changeActiveCrop(savedCrop.key);
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
    if (sensorData.soilSensorOk === false || sensorData.soilMoisture == null) return "Unknown";

    if (
      sensorData.soilMoisture > 60
    ) {
      return "Excellent";
    }

    if (sensorData.soilMoisture > 35) {
      return "Moderate";
    }

    return "Critical";
  };

  const lastUpdatedDate = sensorData?.createdAt ? new Date(sensorData.createdAt) : null;
  const dataAgeMs = lastUpdatedDate ? Math.max(0, clockNow - lastUpdatedDate.getTime()) : Infinity;
  const dataIsStale = dataAgeMs > 15000;
  const connectionLabel = apiOnline === false ? "Backend offline" : apiOnline === null ? "Connecting" : dataIsStale ? "Sensor data stale" : "Live sensor data";

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

        <div role="status" style={{ ...styles.connectionBanner, ...(apiOnline === false || dataIsStale ? styles.connectionWarning : {}) }}>
          <span aria-hidden="true">●</span> {connectionLabel}
          {lastUpdatedDate && <span> · Last reading: {lastUpdatedDate.toLocaleString()}</span>}
        </div>

        {!sensorData ? (
          <div role="alert" style={styles.errorCard}>
            <h2>{apiOnline === false ? "Backend connection unavailable" : "No sensor reading yet"}</h2>
            <p>{sensorFetchError || "Waiting for the first ESP32 reading. Check that the backend is running and the device has posted data."}</p>
          </div>
        ) : (
          <>
            {/* TOP CARDS */}

            <div style={styles.cards}>
              <DashboardCard
                title="Soil Moisture"
                value={sensorData.soilMoisture == null ? "Unavailable" : `${sensorData.soilMoisture}%`}
                icon={<FaSeedling />}
                color="#68be96"
              />

              <DashboardCard
                title="Soil Condition"
                value={sensorData.soilCondition || "Unavailable"}
                icon={<FaSeedling />}
                color="#71b991"
              />

              <DashboardCard
                title="Temperature"
                value={sensorData.temperature == null ? "Unavailable" : `${sensorData.temperature}°C`}
                icon={<FaTemperatureHigh />}
                color="#eca06b"
              />

              <DashboardCard
                title="Humidity"
                value={sensorData.humidity == null ? "Unavailable" : `${sensorData.humidity}%`}
                icon={<FaTint />}
                color="#6abed3"
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

            <p style={styles.pumpPending}>
              Physical pump automation: <strong>PENDING HARDWARE</strong>. Irrigation status below is a software recommendation only.
            </p>

            <motion.div ref={irrigationRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.cropCard}>
              <h2>🌾 Crop-aware Irrigation</h2>
              <label style={styles.cropLabel} htmlFor="crop-select">Crop being monitored</label>
              <select id="crop-select" value={selectedCropKey} onChange={(event) => { setCustomCropSaveMessage(""); changeActiveCrop(event.target.value); }} style={styles.cropSelect}>
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
                  <div><h3>Current Soil Moisture</h3><p>{sensorData.soilMoisture == null ? "Unavailable" : `${sensorData.soilMoisture}%`}</p></div>
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
                    {locationInfo?.name || "Unavailable"}
                  </p>
                  <p style={styles.locationSource}>
                    {{ browser: "From this laptop's location", place: `Typed place: ${locationInfo?.place}`, ip: "Approximate (from internet connection)" }[locationInfo?.source] || ""}
                  </p>
                  <button type="button" onClick={useLaptopLocation} disabled={isLocating} style={styles.saveCropButton}>
                    {isLocating ? "Locating..." : "Use my laptop's location"}
                  </button>
                  <div style={styles.placeRow}>
                    <input
                      placeholder="Or type your area, e.g. Vidyavihar, Mumbai"
                      value={placeInput}
                      onChange={(event) => setPlaceInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") savePlace(); }}
                      style={styles.cropInput}
                      aria-label="Area or city name"
                    />
                    <button type="button" onClick={savePlace} disabled={isLocating || !placeInput.trim()} style={styles.saveCropButton}>
                      Set place
                    </button>
                  </div>
                  {locationMessage && <p style={styles.locationSource}>{locationMessage}</p>}
                </div>

                <div>
                  <h3>☁ Weather</h3>

                  <p>
                    {sensorData.weatherCondition || "Unavailable"}
                  </p>
                </div>

                <div>
                  <h3>🌧 Rainfall</h3>

                  <p>
                    {sensorData.rainfall == null ? "Unavailable" : `${sensorData.rainfall} mm`}
                  </p>
                </div>

                <div>
                  <h3>🌦 Rain forecast</h3>
                  <p>
                    {sensorData.forecastRainMm == null
                      ? "Unavailable"
                      : `${sensorData.forecastRainMm} mm in next ${sensorData.forecastWindowHours} h · ${sensorData.forecastRainChance}% chance`}
                  </p>
                </div>

                <div>
                  <h3>Soil Sensor</h3>
                  <p>{sensorData.soilSensorOk == null ? "Status unknown" : sensorData.soilSensorOk ? "Online" : "Offline"}</p>
                </div>

                <div>
                  <h3>DHT22 Sensor</h3>
                  <p>{sensorData.dhtSensorOk == null ? "Status unknown" : sensorData.dhtSensorOk ? "Online" : "Offline"}</p>
                </div>

                <div>
                  <h3>💨 Wind Speed</h3>

                  <p>
                    {sensorData.windSpeed == null ? "Unavailable" : `${sensorData.windSpeed} kph`}
                  </p>
                </div>

                <div>
                  <h3>🕒 Last Updated</h3>

                  <p>
                    {lastUpdatedDate ? lastUpdatedDate.toLocaleString() : "Not available"}
                  </p>
                </div>
              </div>

              <div style={styles.aiBox}>
                <h3>Recommendation</h3>

                <p style={styles.recommendationText}>
                  {irrigationDecision?.message || "Unavailable"}
                </p>
                {irrigationDecision?.reasons?.length > 0 && (
                  <>
                    <h4 style={styles.whyHeading}>Why?</h4>
                    <ul style={styles.reasonList}>
                      {irrigationDecision.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </>
                )}
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
                      : getHealthStatus() === "Unknown"
                      ? "#8a9a94"
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

  connectionBanner: {
    margin: "-18px 0 24px",
    padding: "12px 16px",
    borderRadius: "12px",
    background: "#e4f6ec",
    color: "#286648",
    fontSize: "14px",
  },

  connectionWarning: {
    background: "#fff1d8",
    color: "#805a18",
  },

  errorCard: {
    padding: "24px",
    borderRadius: "16px",
    background: "#fff1d8",
    color: "#684d21",
  },

  pumpPending: {
    margin: "-8px 0 24px",
    padding: "14px 18px",
    borderRadius: "12px",
    background: "#fff1d8",
    color: "#684d21",
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

  placeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
  },

  whyHeading: {
    margin: "14px 0 6px",
    color: "#285742",
  },

  reasonList: {
    margin: 0,
    paddingLeft: "20px",
    lineHeight: 1.7,
    color: "#3d6555",
  },

  locationSource: {
    marginTop: "6px",
    fontSize: "13px",
    color: "#6c8b80",
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
