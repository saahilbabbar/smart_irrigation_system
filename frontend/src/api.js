import axios from "axios";

// Default: the backend on the same machine that served the dashboard, so it works
// both at http://localhost:5173 and from teammates' devices at http://<laptop LAN IP>:5173.
const DEFAULT_API = `http://${window.location.hostname}:3001/api/sensors`;
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API).replace(/\/$/, "");
export const SETTINGS_URL = API_BASE_URL.replace(/\/sensors$/, "/settings");
export const AUTH_URL = API_BASE_URL.replace(/\/sensors$/, "/auth");

const TOKEN_KEY = "smartfarm.token";

// Storage can be unavailable (private mode, blocked site data); fail soft.
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Session then lasts only until reload.
  }
};

let handleUnauthorized = () => {};
export const setUnauthorizedHandler = (handler) => {
  handleUnauthorized = handler;
};

axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Any 401 (expired token, deleted account) signs the user out, except a failed login attempt.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    if (error.response?.status === 401 && !url.endsWith("/auth/login") && !url.endsWith("/auth/setup")) {
      handleUnauthorized();
    }
    return Promise.reject(error);
  }
);
