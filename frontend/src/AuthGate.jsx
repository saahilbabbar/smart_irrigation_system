import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import App from "./App.jsx";
import { AUTH_URL, getToken, setToken, setUnauthorizedHandler } from "./api";

// Decides what to show: one-time admin setup, sign-in, or the dashboard.
export default function AuthGate() {
  const [phase, setPhase] = useState("checking"); // checking | offline | setup | login | ready
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState("");

  const checkSession = useCallback(async () => {
    if (getToken()) {
      try {
        const response = await axios.get(`${AUTH_URL}/me`);
        setUser(response.data.user);
        setPhase("ready");
        return;
      } catch (error) {
        if (!error.response) {
          setPhase("offline");
          return;
        }
        setToken(null);
      }
    }
    try {
      const response = await axios.get(`${AUTH_URL}/status`);
      setPhase(response.data.needsSetup ? "setup" : "login");
    } catch {
      setPhase("offline");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      setNotice("Your session ended. Please sign in again.");
      setPhase("login");
    });
    const initial = setTimeout(checkSession, 0);
    return () => clearTimeout(initial);
  }, [checkSession]);

  const signedIn = ({ token, user: signedInUser }) => {
    setToken(token);
    setUser(signedInUser);
    setNotice("");
    setPhase("ready");
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    setNotice("Signed out.");
    setPhase("login");
  };

  if (phase === "ready" && user) return <App user={user} onSignOut={signOut} />;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}><span style={styles.logoMark}>✦</span> SmartFarm</h1>
        {phase === "checking" && <p>Connecting…</p>}
        {phase === "offline" && (
          <>
            <p role="alert">Could not reach the SmartFarm backend. Check that it is running on port 3001.</p>
            <button type="button" style={styles.button} onClick={() => { setPhase("checking"); checkSession(); }}>Retry</button>
          </>
        )}
        {(phase === "setup" || phase === "login") && (
          <AuthForm key={phase} mode={phase} notice={notice} onSuccess={signedIn} />
        )}
      </div>
    </div>
  );
}

function AuthForm({ mode, notice, onSuccess }) {
  const isSetup = mode === "setup";
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (isSetup && form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = isSetup
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password };
      const response = await axios.post(`${AUTH_URL}/${isSetup ? "setup" : "login"}`, body);
      onSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Could not reach the backend.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <h2 style={styles.title}>{isSetup ? "Create the admin account" : "Sign in"}</h2>
      <p style={styles.hint}>
        {isSetup
          ? "First-time setup. This account can change the crop and location, and add other users."
          : "Sign in to view your farm's readings."}
      </p>
      {notice && !isSetup && <p style={styles.notice}>{notice}</p>}

      {isSetup && (
        <label style={styles.label}>Name
          <input style={styles.input} value={form.name} onChange={update("name")} autoComplete="name" required />
        </label>
      )}
      <label style={styles.label}>Email
        <input style={styles.input} type="email" value={form.email} onChange={update("email")} autoComplete="username" required />
      </label>
      <label style={styles.label}>Password
        <input style={styles.input} type="password" value={form.password} onChange={update("password")}
          autoComplete={isSetup ? "new-password" : "current-password"} minLength={isSetup ? 8 : undefined} required />
      </label>
      {isSetup && (
        <label style={styles.label}>Confirm password
          <input style={styles.input} type="password" value={form.confirm} onChange={update("confirm")} autoComplete="new-password" required />
        </label>
      )}

      {error && <p role="alert" style={styles.error}>{error}</p>}
      <button type="submit" style={styles.button} disabled={busy}>
        {busy ? "Please wait…" : isSetup ? "Create admin account" : "Sign in"}
      </button>
    </form>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px 16px",
    boxSizing: "border-box",
    background: "linear-gradient(135deg, #f7fff9 0%, #edf9f4 48%, #f5f2ff 100%)",
    color: "#27413a",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    background: "rgba(255, 255, 255, 0.9)",
    border: "1px solid #e0eee7",
    borderRadius: "22px",
    padding: "32px 28px",
    boxShadow: "0 12px 30px rgba(55, 107, 83, 0.09)",
    boxSizing: "border-box",
  },
  logo: { margin: "0 0 20px", fontSize: "27px", color: "#2f7d62", letterSpacing: "-1px" },
  logoMark: { color: "#f3a8b7" },
  form: { display: "grid", gap: "14px" },
  title: { margin: 0, fontSize: "21px" },
  hint: { margin: 0, color: "#6c8b80", fontSize: "14px", lineHeight: 1.5 },
  notice: { margin: 0, padding: "10px 12px", borderRadius: "10px", background: "#e4f6ec", color: "#286648", fontSize: "14px" },
  label: { display: "grid", gap: "6px", fontSize: "14px", color: "#55736a" },
  input: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #c9e2d5",
    background: "#fbfffc",
    color: "#27413a",
    fontSize: "16px",
  },
  error: { margin: 0, color: "#b04a5e", fontSize: "14px" },
  button: {
    padding: "12px 18px",
    border: 0,
    borderRadius: "8px",
    background: "#a7dfc2",
    color: "#1e5540",
    fontWeight: 700,
    fontSize: "15px",
    cursor: "pointer",
  },
};
