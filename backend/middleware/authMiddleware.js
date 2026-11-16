const jwt = require("jsonwebtoken");

const User = require("../models/User");

// Requires "Authorization: Bearer <JWT>". Loads the user on every request so a
// deleted user or changed role takes effect immediately.
const requireAuth = async (req, res, next) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Sign in required" });
  }

  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ error: "Account no longer exists" });
    }
    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Only an admin can do this" });
  }
  return next();
};

module.exports = { requireAuth, requireAdmin };
