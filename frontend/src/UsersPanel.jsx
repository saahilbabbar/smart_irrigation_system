import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { AUTH_URL } from "./api";

const EMPTY_FORM = { name: "", email: "", password: "", role: "viewer" };

// Admin-only: add people, change their role, remove them.
export default function UsersPanel({ currentUser, style }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const response = await axios.get(`${AUTH_URL}/users`);
      setUsers(response.data);
    } catch (error) {
      setMessage(error.response?.data?.error || "Could not load users.");
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(loadUsers, 0);
    return () => clearTimeout(initial);
  }, [loadUsers]);

  const run = async (action, successMessage) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      await loadUsers();
      return true;
    } catch (error) {
      setMessage(error.response?.data?.error || "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addUser = async (event) => {
    event.preventDefault();
    const added = await run(() => axios.post(`${AUTH_URL}/users`, form), `${form.name} added as ${form.role}.`);
    if (added) setForm(EMPTY_FORM);
  };

  const changeRole = (user, role) => run(
    () => axios.patch(`${AUTH_URL}/users/${user.id}`, { role }),
    `${user.name} is now ${role === "admin" ? "an admin" : "a viewer"}.`
  );

  const resetPassword = (user) => {
    const newPassword = window.prompt(`New temporary password for ${user.name} (at least 8 characters). Share it with them privately:`);
    if (newPassword === null) return;
    run(
      () => axios.put(`${AUTH_URL}/users/${user.id}/password`, { newPassword }),
      `Password reset for ${user.name}. They can change it after signing in.`
    );
  };

  const removeUser = (user) => {
    if (!window.confirm(`Remove ${user.name} (${user.email})? They will no longer be able to sign in.`)) return;
    run(() => axios.delete(`${AUTH_URL}/users/${user.id}`), `${user.name} removed.`);
  };

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <div style={{ ...styles.card, ...style }}>
      <h2>👥 Users</h2>
      <p style={styles.hint}>Admins can change the crop and location and manage users. Viewers can only watch the dashboard.</p>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr><th style={styles.th}>Name</th><th style={styles.th}>Email</th><th style={styles.th}>Role</th><th style={styles.th} aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id}>
                  <td style={styles.td}>{user.name}{isSelf && " (you)"}</td>
                  <td style={styles.td}>{user.email}</td>
                  <td style={styles.td}>
                    <select
                      value={user.role}
                      disabled={isSelf || busy}
                      onChange={(event) => changeRole(user, event.target.value)}
                      style={styles.input}
                      aria-label={`Role for ${user.name}`}
                    >
                      <option value="viewer">viewer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    {!isSelf && (
                      <div style={styles.actions}>
                        <button type="button" onClick={() => resetPassword(user)} disabled={busy} style={styles.resetButton}>Reset password</button>
                        <button type="button" onClick={() => removeUser(user)} disabled={busy} style={styles.removeButton}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={addUser} style={styles.form}>
        <h3 style={styles.formTitle}>Add a user</h3>
        <input placeholder="Name" value={form.name} onChange={update("name")} required style={styles.input} aria-label="Name" />
        <input type="email" placeholder="Email" value={form.email} onChange={update("email")} required style={styles.input} aria-label="Email" />
        <input type="password" placeholder="Temporary password (min 8)" value={form.password} onChange={update("password")}
          minLength={8} required autoComplete="new-password" style={styles.input} aria-label="Temporary password" />
        <select value={form.role} onChange={update("role")} style={styles.input} aria-label="Role">
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy} style={styles.button}>Add user</button>
      </form>
      {message && <p role="status" style={styles.message}>{message}</p>}
    </div>
  );
}

const styles = {
  card: {
    background: "rgba(255, 255, 255, 0.88)",
    border: "1px solid #e0eee7",
    padding: "25px",
    borderRadius: "22px",
    boxShadow: "0 12px 30px rgba(55, 107, 83, 0.07)",
  },
  hint: { color: "#6c8b80", fontSize: "14px" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  th: { textAlign: "left", padding: "8px", borderBottom: "1px solid #e0eee7", color: "#55736a" },
  td: { padding: "8px", borderBottom: "1px solid #f0f6f3", overflowWrap: "anywhere" },
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
    marginTop: "20px",
  },
  formTitle: { gridColumn: "1 / -1", margin: "0 0 4px" },
  input: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #c9e2d5",
    background: "#fbfffc",
    color: "#27413a",
    fontSize: "15px",
  },
  button: {
    padding: "10px 16px",
    border: 0,
    borderRadius: "8px",
    background: "#a7dfc2",
    color: "#1e5540",
    fontWeight: 700,
    cursor: "pointer",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: "6px" },
  resetButton: {
    padding: "6px 10px",
    border: "1px solid #c8ebd9",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#266b54",
    cursor: "pointer",
  },
  removeButton: {
    padding: "6px 10px",
    border: "1px solid #efc4cd",
    borderRadius: "8px",
    background: "#fff5f7",
    color: "#a2455a",
    cursor: "pointer",
  },
  message: { marginTop: "12px", color: "#2f8a67" },
};
