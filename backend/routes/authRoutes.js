const express = require("express");

const {
  getStatus,
  setupAdmin,
  loginUser,
  getMe,
  listUsers,
  addUser,
  updateUserRole,
  deleteUser,
  changeOwnPassword,
  resetUserPassword,
} = require("../controllers/authController");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/status", getStatus);
router.post("/setup", setupAdmin);
router.post("/login", loginUser);
router.get("/me", requireAuth, getMe);
router.put("/me/password", requireAuth, changeOwnPassword);

// Accounts are created by an admin; there is no public self-registration.
router.get("/users", requireAuth, requireAdmin, listUsers);
router.post("/users", requireAuth, requireAdmin, addUser);
router.patch("/users/:id", requireAuth, requireAdmin, updateUserRole);
router.delete("/users/:id", requireAuth, requireAdmin, deleteUser);
router.put("/users/:id/password", requireAuth, requireAdmin, resetUserPassword);

module.exports = router;
