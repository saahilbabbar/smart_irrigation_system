const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

const { ROLES } = User;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

const validateNewUser = ({ name, email, password, role }) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) return "Enter a name (up to 60 characters).";
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (role !== undefined && !ROLES.includes(role)) return "Role must be admin or viewer.";
  return null;
};

const createUser = async ({ name, email, password, role }) => User.create({
  name: name.trim(),
  email: email.trim().toLowerCase(),
  password: await bcrypt.hash(password, 10),
  role,
});

const adminExists = () => User.exists({ role: "admin" });

/*
  Simple in-memory login throttle: 10 failed attempts per IP per 15 minutes.
*/
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const failedLogins = new Map();

const isThrottled = (ip) => {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
};

const recordFailedLogin = (ip) => {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.firstAt > LOGIN_WINDOW_MS) {
    failedLogins.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
};

// GET /api/auth/status: whether the one-time admin setup is still needed.
exports.getStatus = async (req, res) => {
  try {
    return res.json({ needsSetup: !(await adminExists()) });
  } catch (error) {
    return res.status(500).json({ error: "Failed to check setup status" });
  }
};

// POST /api/auth/setup: create the first admin. Only allowed while no admin exists.
exports.setupAdmin = async (req, res) => {
  try {
    if (await adminExists()) {
      return res.status(409).json({ error: "Setup is already complete. Sign in instead." });
    }
    const error = validateNewUser(req.body || {});
    if (error) return res.status(400).json({ error });

    const user = await createUser({ ...req.body, role: "admin" });
    return res.status(201).json({ token: signToken(user), user: user.toPublic() });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
    return res.status(500).json({ error: "Failed to create admin account" });
  }
};

// POST /api/auth/login
exports.loginUser = async (req, res) => {
  const { email, password } = req.body || {};
  if (isThrottled(req.ip)) {
    return res.status(429).json({ error: "Too many failed sign-in attempts. Try again in 15 minutes." });
  }
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordFailedLogin(req.ip);
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    failedLogins.delete(req.ip);
    return res.json({ token: signToken(user), user: user.toPublic() });
  } catch (error) {
    return res.status(500).json({ error: "Sign-in failed" });
  }
};

// GET /api/auth/me
exports.getMe = (req, res) => res.json({ user: req.user.toPublic() });

/*
  User management (admin only)
*/

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: 1 });
    return res.json(users.map((user) => user.toPublic()));
  } catch (error) {
    return res.status(500).json({ error: "Failed to list users" });
  }
};

exports.addUser = async (req, res) => {
  const body = { ...req.body, role: req.body?.role ?? "viewer" };
  const error = validateNewUser(body);
  if (error) return res.status(400).json({ error });

  try {
    const user = await createUser(body);
    return res.status(201).json(user.toPublic());
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
    return res.status(500).json({ error: "Failed to add user" });
  }
};

const findOtherUser = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "User not found" });
    return null;
  }
  if (req.user._id.equals(req.params.id)) {
    res.status(400).json({ error: "You cannot change or remove your own account here." });
    return null;
  }
  const user = await User.findById(req.params.id);
  if (!user) res.status(404).json({ error: "User not found" });
  return user;
};

exports.updateUserRole = async (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: "Role must be admin or viewer." });

  try {
    const user = await findOtherUser(req, res);
    if (!user) return undefined;
    user.role = role;
    await user.save();
    return res.json(user.toPublic());
  } catch (error) {
    return res.status(500).json({ error: "Failed to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await findOtherUser(req, res);
    if (!user) return undefined;
    await user.deleteOne();
    return res.json({ deleted: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete user" });
  }
};

const validPassword = (password) => typeof password === "string" && password.length >= MIN_PASSWORD;

// PUT /api/auth/me/password: any signed-in user, must confirm the current password.
exports.changeOwnPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!validPassword(newPassword)) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters.` });
  }

  try {
    const user = await User.findById(req.user._id).select("+password");
    if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ changed: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to change password" });
  }
};

// PUT /api/auth/users/:id/password: admin sets a new temporary password for someone else.
exports.resetUserPassword = async (req, res) => {
  const { newPassword } = req.body || {};
  if (!validPassword(newPassword)) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters.` });
  }

  try {
    const user = await findOtherUser(req, res);
    if (!user) return undefined;
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.json({ reset: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reset password" });
  }
};
