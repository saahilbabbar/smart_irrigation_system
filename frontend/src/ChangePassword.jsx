import { useState } from "react";
import axios from "axios";

import { AUTH_URL } from "./api";

const EMPTY = { currentPassword: "", newPassword: "", confirm: "" };

// Lets the signed-in user replace the temporary password an admin gave them.
export default function ChangePassword({ onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (form.newPassword !== form.confirm) {
      setIsError(true);
      setMessage("New passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await axios.put(`${AUTH_URL}/me/password`, {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm(EMPTY);
      setIsError(false);
      setMessage("Password changed.");
    } catch (error) {
      setIsError(true);
      setMessage(error.response?.data?.error || "Could not change the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <input type="password" placeholder="Current password" value={form.currentPassword} onChange={update("currentPassword")}
        autoComplete="current-password" required style={styles.input} aria-label="Current password" />
      <input type="password" placeholder="New password (min 8)" value={form.newPassword} onChange={update("newPassword")}
        autoComplete="new-password" minLength={8} required style={styles.input} aria-label="New password" />
      <input type="password" placeholder="Confirm new password" value={form.confirm} onChange={update("confirm")}
        autoComplete="new-password" required style={styles.input} aria-label="Confirm new password" />
      <div style={styles.row}>
        <button type="submit" disabled={busy} style={styles.button}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} style={styles.secondary}>Close</button>
      </div>
      {message && <p role={isError ? "alert" : "status"} style={{ ...styles.message, color: isError ? "#b04a5e" : "#2f8a67" }}>{message}</p>}
    </form>
  );
}

const styles = {
  form: { display: "grid", gap: "8px", marginTop: "10px" },
  input: {
    padding: "9px",
    borderRadius: "8px",
    border: "1px solid #c9e2d5",
    background: "#fbfffc",
    color: "#27413a",
    fontSize: "14px",
    minWidth: 0,
  },
  row: { display: "flex", gap: "8px" },
  button: {
    padding: "8px 12px",
    border: 0,
    borderRadius: "8px",
    background: "#a7dfc2",
    color: "#1e5540",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondary: {
    padding: "8px 12px",
    border: "1px solid #c8ebd9",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#266b54",
    cursor: "pointer",
  },
  message: { margin: 0, fontSize: "13px" },
};
